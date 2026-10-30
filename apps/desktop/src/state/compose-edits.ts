import type { ComposeOutcome, Song } from '@gp-editor/core';
import { composeSummary } from '../compose/summary';
import { t } from '../lib/i18n/i18n';
import { clampCursor } from '../lib/navigation';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { followTrackChanges } from './track-remap';

/**
 * Compose from Here's bars written into the score as one undo step: `outcome` is gp-core's applyComposedBars of the
 * answer on `basis`, the song Claude was shown. When the score has changed since, nothing is written and the hint strip
 * says so; an outcome that leaves the score as it was records nothing.
 */
export interface ComposeAction {
  readonly type: 'applyComposedBars';
  readonly basis: Song;
  readonly outcome: ComposeOutcome;
  /** Where the bars were written from, 0-based (the score's bar count = right after its last bar). */
  readonly startIndex: number;
}

/** The bars written: the shown track, cursor and selection following the tracks, the cursor on a beat the bar has. */
export function composeBars(state: EditorState, action: ComposeAction): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  if (document.song !== action.basis) {
    return { ...state, hint: t('tools.compose.changed') };
  }
  const { song } = action.outcome;
  const recorded = recordSong(state, document, song);
  if (recorded === state) {
    return state;
  }
  const start = Math.min(action.startIndex, document.song.measureHeaders.length);
  const followed = followTrackChanges({ ...recorded, hint: `${composeSummary(action.outcome, start)}. ${t('tools.compose.undoHint')}` }, document.song, song);
  return followed.cursor === undefined ? followed : { ...followed, cursor: clampCursor(song, followed.cursor) };
}
