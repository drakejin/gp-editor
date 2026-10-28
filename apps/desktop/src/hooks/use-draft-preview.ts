import { useMemo, useState } from 'react';
import type { Song, StringAddress } from '@gp-editor/core';
import { type NoteEdit, applyNoteEdit } from '../state/note-edits';

export interface DraftPreview {
  /** The song the score shows: with the previewed edit at the cursor while there is one. */
  readonly song: Song | undefined;
  /** A note panel's draft as an edit to show on the score (undefined: none); it stays out of the undo history. */
  readonly show: (edit: NoteEdit | undefined) => void;
}

/**
 * The bend and tremolo bar panels' live preview: the score shows their draft on the note at the cursor before Apply
 * makes it an edit. The edit is cheap (the other measures stay the same objects, so their rows are not redrawn).
 */
export function useDraftPreview(song: Song | undefined, cursor: StringAddress | undefined): DraftPreview {
  const [edit, setEdit] = useState<NoteEdit | undefined>(undefined);
  const shown = useMemo(() => (edit === undefined || song === undefined || cursor === undefined ? song : applyNoteEdit(song, cursor, edit)), [edit, song, cursor]);
  return { song: shown, show: setEdit };
}
