import type { Song } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { clampCursor } from '../lib/navigation';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { followTrackChanges } from './track-remap';

/**
 * AI Edit's result written into the score as one undo step: `song` is the edit of `basis`, the song the edit (and
 * Claude) started from. When the score has changed since, nothing is written and the hint strip says so; a song left
 * as it was records nothing. `keepsBeats`: the exact edit (transposition and fingering) changes no beat, so the
 * selection stays for another one.
 */
export interface AiEditAction {
  readonly type: 'applyAiEdit';
  readonly basis: Song;
  readonly song: Song;
  /** What changed, for the hint strip. */
  readonly summary: string;
  readonly keepsBeats: boolean;
}

/** The summary with the undo hint after it, one full stop between them. */
function hintOf(summary: string): string {
  const said = summary.trim().replace(/\.$/, '');
  return said === '' ? t('aiEdit.undoHint') : `${said}. ${t('aiEdit.undoHint')}`;
}

/** The edit written: the shown track, cursor and selection following the tracks, the cursor on a beat its bar has. */
export function applyAiEdit(state: EditorState, action: AiEditAction): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  if (document.song !== action.basis) {
    return { ...state, hint: t('aiEdit.changed') };
  }
  const recorded = recordSong(state, document, action.song);
  if (recorded === state) {
    return state;
  }
  const followed = followTrackChanges({ ...recorded, hint: hintOf(action.summary) }, document.song, action.song);
  return followed.cursor === undefined ? followed : { ...followed, cursor: clampCursor(action.song, followed.cursor) };
}
