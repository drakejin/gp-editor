import {
  type ComposedBars,
  type Song,
  applyComposedBars,
} from '@gp-editor/core';
import { composeSummary } from '../compose/summary';
import { t } from '../lib/i18n/i18n';
import { DRUM_TRACK_MODE } from './document-edits';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { setTrackMode } from './track-display';
import { followTrackChanges } from './track-remap';

/**
 * Compose from Here's bars written into the score as one undo step (gp-core's applyComposedBars). `basis` is the song
 * Claude was shown: when the score has changed since, nothing is written and the hint strip says so.
 */
export interface ComposeAction {
  readonly type: 'applyComposedBars';
  readonly basis: Song;
  readonly composed: ComposedBars;
  /** 0-based; the score's bar count = right after its last bar. */
  readonly startIndex: number;
}

/** The bars written, the shown track, cursor and selection following the tracks, a new drum track shown as notation. */
export function composeBars(
  state: EditorState,
  action: ComposeAction,
): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  if (document.song !== action.basis) {
    return { ...state, hint: t('tools.compose.changed') };
  }
  const outcome = applyComposedBars(
    document.song,
    action.composed,
    action.startIndex,
  );
  const recorded = recordSong(state, document, outcome.song);
  if (recorded === state) {
    return state;
  }
  const start = Math.min(
    action.startIndex,
    document.song.measureHeaders.length,
  );
  const followed = followTrackChanges(
    {
      ...recorded,
      hint: `${composeSummary(outcome, start)}. ${t('tools.compose.undoHint')}`,
    },
    document.song,
    outcome.song,
  );
  const newDrums = outcome.song.tracks.flatMap((track, trackIndex) =>
    trackIndex >= document.song.tracks.length && track.isPercussion
      ? [trackIndex]
      : [],
  );
  return {
    ...followed,
    trackDisplay: newDrums.reduce(
      (display, trackIndex) =>
        setTrackMode(display, trackIndex, DRUM_TRACK_MODE),
      followed.trackDisplay,
    ),
  };
}
