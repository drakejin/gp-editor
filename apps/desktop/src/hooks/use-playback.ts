import { useCallback, useEffect, useRef, useState } from 'react';
import { type Song, type TimelineEntry, positionAt, renderMidi } from '@gp-editor/core';
import { bytesToBase64 } from '../lib/base64';
import { playingBeatAt, samePlayingBeat } from '../lib/playing-beat';
import { playMidi, playerPosition, stopMidi } from '../native/player';
import type { PlayingBeat } from '../score/row';

/** How often the player position is read while playing. */
const POLL_INTERVAL_MS = 40;

function clearTimer(timer: { current: ReturnType<typeof setInterval> | undefined }): void {
  if (timer.current !== undefined) {
    clearInterval(timer.current);
    timer.current = undefined;
  }
}

export interface Playback {
  readonly isPlaying: boolean;
  /** Beat of the shown track that is sounding now. */
  readonly playing?: PlayingBeat;
  readonly error?: string;
  readonly start: (fromMeasureIndex: number) => void;
  readonly stop: () => void;
  readonly dismissError: () => void;
}

interface PlaybackState {
  readonly isPlaying: boolean;
  readonly playing?: PlayingBeat;
  readonly error?: string;
}

/** Plays the whole song (all tracks, honouring mute/solo) from a measure and follows it on the given track. */
export function usePlayback(song: Song | undefined, trackIndex: number): Playback {
  const [state, setState] = useState<PlaybackState>({ isPlaying: false });
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Every start/stop bumps this; a play() that resolves for an older generation is ignored.
  const generation = useRef(0);
  const follow = useRef({ song, trackIndex, timeline: [] as readonly TimelineEntry[] });
  follow.current = { ...follow.current, song, trackIndex };

  const stop = useCallback(() => {
    generation.current += 1;
    clearTimer(timer);
    void stopMidi();
    setState({ isPlaying: false });
  }, []);

  const poll = useCallback(async () => {
    const position = await playerPosition();
    const { song: current, trackIndex: shownTrack, timeline } = follow.current;
    if (!position.isPlaying || current === undefined) {
      stop();
      return;
    }
    const at = positionAt(timeline, position.seconds);
    const playing = at === undefined ? undefined : playingBeatAt(current, shownTrack, at);
    setState((previous) => (previous.isPlaying && samePlayingBeat(previous.playing, playing) ? previous : { isPlaying: true, playing }));
  }, [stop]);

  const start = useCallback(
    (fromMeasureIndex: number) => {
      const current = follow.current.song;
      if (current === undefined) {
        return;
      }
      generation.current += 1;
      const startedGeneration = generation.current;
      clearTimer(timer);
      try {
        const render = renderMidi(current, { fromHeaderIndex: fromMeasureIndex });
        follow.current = { ...follow.current, timeline: render.timeline };
        // Shown as playing at once, so a second Space press stops it even before the player has started.
        setState({ isPlaying: true });
        playMidi(bytesToBase64(render.bytes))
          .then(() => {
            if (generation.current === startedGeneration) {
              clearTimer(timer);
              timer.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
            }
          })
          .catch((error: unknown) => {
            if (generation.current === startedGeneration) {
              setState({ isPlaying: false, error: errorMessage(error) });
            }
          });
      } catch (error: unknown) {
        setState({ isPlaying: false, error: errorMessage(error) });
      }
    },
    [poll],
  );

  const dismissError = useCallback(() => setState((previous) => ({ ...previous, error: undefined })), []);

  useEffect(
    () => () => {
      generation.current += 1;
      clearTimer(timer);
      void stopMidi();
    },
    [],
  );

  return { ...state, start, stop, dismissError };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Playback failed';
}
