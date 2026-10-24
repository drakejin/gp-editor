import { type Dispatch, useCallback, useEffect, useMemo } from 'react';
import { subscribeTrackViewRequests } from '../native/gp-files';
import type { ScoreMode } from '../score/geometry';
import type { StaffSpec } from '../score/score-layout';
import type { EditorAction, EditorState } from '../state/editor';
import { shownStaves, trackModeOf } from '../state/track-display';

/** The shown tab's tracks on the score: what the score, playback, the inspector and the tracks panel read of them. */
export interface TrackDisplayView {
  /** One per shown track, in track order. */
  readonly staves: readonly StaffSpec[];
  readonly shownTrackIndexes: readonly number[];
  /** The selected track's staves (the Track inspector's notation toggles). */
  readonly selectedMode: ScoreMode;
  readonly isMultitrack: boolean;
  readonly toggleMultitrack: () => void;
  /** A track's eye in the tracks panel. */
  readonly toggleTrackShown: (trackIndex: number) => void;
}

/** The multitrack view of the shown tab, and View ▸ Multitrack (F3), Previous Track and Next Track from the menu. */
export function useTrackDisplay(state: EditorState, dispatch: Dispatch<EditorAction>): TrackDisplayView {
  const { trackDisplay, mode, trackIndex } = state;
  const trackCount = state.document?.song.tracks.length ?? 0;
  const staves = useMemo(() => shownStaves(trackDisplay, mode, trackCount, trackIndex), [trackDisplay, mode, trackCount, trackIndex]);
  const shownTrackIndexes = useMemo(() => staves.map((staff) => staff.trackIndex), [staves]);
  const toggleMultitrack = useCallback(() => dispatch({ type: 'toggleMultitrack' }), [dispatch]);
  const toggleTrackShown = useCallback((index: number) => dispatch({ type: 'toggleTrackShown', trackIndex: index }), [dispatch]);
  useEffect(
    () =>
      subscribeTrackViewRequests({
        onMultitrackRequested: toggleMultitrack,
        onPreviousTrackRequested: () => dispatch({ type: 'moveCursorTrack', step: -1 }),
        onNextTrackRequested: () => dispatch({ type: 'moveCursorTrack', step: 1 }),
      }),
    [dispatch, toggleMultitrack],
  );
  const selectedMode = trackModeOf(trackDisplay, mode, trackIndex);
  return { staves, shownTrackIndexes, selectedMode, isMultitrack: trackDisplay.isMultitrack, toggleMultitrack, toggleTrackShown };
}
