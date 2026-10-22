import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import type { LoopPass } from '../lib/practice-plan';
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

  const stop = useCallback(() => stopPlayer(session), [session]);
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

  useEffect(() => () => releasePlayer(session), [session]);

  return { ...state, practice, start, stop, dismissError, changePractice };
}
