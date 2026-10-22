import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { type LiveChange, hasSameMuteAndSolo, liveChannelChanges } from '../lib/live-channels';
import type { LoopPass } from '../lib/practice-plan';
import { setMidiController, setMidiProgram } from '../native/player';
import type { PlayingBeat } from '../score/row';
import { INITIAL_PRACTICE, type PracticeAction, type PracticeSettings, practiceReducer } from '../state/practice';
import {
  type Follow,
  type PlaybackState,
  type PlayerSession,
  launchPlayer,
  releasePlayer,
  resumePlayer,
  stopPlayer,
} from './player-session';

export interface Playback {
  readonly isPlaying: boolean;
  /** Beat of the shown track that is sounding now. */
  readonly playing?: PlayingBeat;
  /** While a loop plays: the pass being played and its tempo. */
  readonly loopPass?: LoopPass;
  readonly error?: string;
  /** Playback tempo, loop and speed trainer of this session (never saved to the file). */
  readonly practice: PracticeSettings;
  /** Plays from a bar; when looping, plays the loop from its first bar until stopped. */
  readonly start: (fromMeasureIndex: number) => void;
  readonly stop: () => void;
  readonly dismissError: () => void;
  /** Changes the practice settings; while playing, playback restarts at the current bar with them. */
  readonly changePractice: (action: PracticeAction) => void;
  /** While playing, starts again at the current bar (after a new sound bank); does nothing when stopped. */
  readonly restart: () => void;
}

/** Quiet time after the last click before a coalesced restart. */
const RESTART_DELAY_MS = 300;

function sendLiveChange(change: LiveChange): void {
  const sent =
    change.kind === 'program'
      ? setMidiProgram(change.midiChannel, change.value)
      : setMidiController(change.midiChannel, change.controller, change.value);
  sent.catch(() => undefined);
}

function cancelRestart(timer: { current: ReturnType<typeof setTimeout> | undefined }): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
}

/**
 * Plays the whole song (all tracks, honouring mute/solo) from a measure, or the practice loop pass after pass, at the
 * practice tempo, and follows it on the given track.
 */
export function usePlayback(song: Song | undefined, trackIndex: number): Playback {
  const [state, setState] = useState<PlaybackState>({ isPlaying: false });
  const [practice, setPractice] = useState<PracticeSettings>(INITIAL_PRACTICE);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const generation = useRef(0);
  const follow = useRef<Follow>({ song, trackIndex, practice, timeline: [], measureIndex: 0 });
  follow.current = { ...follow.current, song, trackIndex, practice };
  const session = useMemo<PlayerSession>(() => ({ timer, generation, follow, setState }), []);

  // Restarts are coalesced: a run of clicks (instruments, sound banks) restarts once, after the last.
  const restartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isPlayingNow = useRef(false);
  isPlayingNow.current = state.isPlaying;

  const stop = useCallback(() => {
    cancelRestart(restartTimer);
    stopPlayer(session);
  }, [session]);
  const start = useCallback(
    (fromMeasureIndex: number) =>
      launchPlayer(session, follow.current.practice.isLooping ? {} : { measureIndex: fromMeasureIndex }),
    [session],
  );
  const { isPlaying } = state;
  const changePractice = useCallback(
    (action: PracticeAction) => {
      const previous = follow.current.practice;
      const next = practiceReducer(previous, action);
      if (next === previous) {
        return;
      }
      follow.current = { ...follow.current, practice: next };
      setPractice(next);
      if (isPlaying) {
        resumePlayer(session);
      }
    },
    [session, isPlaying],
  );
  const dismissError = useCallback(() => setState((previous) => ({ ...previous, error: undefined })), []);
  const restart = useCallback(() => {
    cancelRestart(restartTimer);
    restartTimer.current = setTimeout(() => {
      if (isPlayingNow.current) {
        resumePlayer(session);
      }
    }, RESTART_DELAY_MS);
  }, [session]);

  // A track's instrument, volume or pan changed (same bars): sent live on its MIDI channels, heard at once; a restart
  // only when the MIDI channels themselves changed (e.g. the track got a channel of its own) or a track was muted or
  // soloed.
  const followedSong = useRef(song);
  useEffect(() => {
    const previous = followedSong.current;
    followedSong.current = song;
    if (!isPlaying || previous === undefined || song === undefined || previous.measureHeaders !== song.measureHeaders) {
      return;
    }
    if (previous.channels === song.channels && hasSameMuteAndSolo(previous, song)) {
      return;
    }
    const changes = liveChannelChanges(previous, song);
    if (changes === undefined) {
      restart();
      return;
    }
    changes.forEach(sendLiveChange);
  }, [song, isPlaying, restart]);

  // Bars added or deleted while playing move every bar index the timeline and the loop hold: stop rather than follow
  // (and later loop) the wrong bars.
  const measureCount = song?.measureHeaders.length ?? 0;
  const followedMeasureCount = useRef(measureCount);
  useEffect(() => {
    if (followedMeasureCount.current !== measureCount) {
      followedMeasureCount.current = measureCount;
      if (isPlaying) {
        stopPlayer(session);
      }
    }
  }, [measureCount, isPlaying, session]);

  useEffect(
    () => () => {
      cancelRestart(restartTimer);
      releasePlayer(session);
    },
    [session],
  );

  return { ...state, practice, start, stop, dismissError, changePractice, restart };
}
