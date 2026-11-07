import type { Song } from '@gp-editor/core';
import { clampCursor } from '../lib/navigation';
import type { EditorState, OpenDocument } from './editor';
import { followTrackChanges } from './track-remap';

/** Undo depth kept in memory. */
export const HISTORY_LIMIT = 200;

/** The document with `next` as its song, the previous one kept for undo; the same state when nothing changed. */
export function recordSong(state: EditorState, document: OpenDocument, next: Song): EditorState {
  return next === document.song ? state : recordStep(state, document, next);
}

/**
 * The document with `next` as its song and one undo step, also when `next` is the song it had: an action the user sees
 * as a step of its own (a paste of what was there) is undone as one.
 */
export function recordStep(state: EditorState, document: OpenDocument, next: Song): EditorState {
  return {
    ...state,
    document: { ...document, song: next },
    past: [...state.past, document.song].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (state.document === undefined || previous === undefined) {
    return state;
  }
  const undone = followTrackChanges(
    { ...state, document: { ...state.document, song: previous }, past: state.past.slice(0, -1), future: [state.document.song, ...state.future], notice: undefined, hint: undefined },
    state.document.song,
    previous,
  );
  return { ...undone, cursor: undone.cursor === undefined ? undefined : clampCursor(previous, undone.cursor) };
}

export function redo(state: EditorState): EditorState {
  const [next, ...rest] = state.future;
  if (state.document === undefined || next === undefined) {
    return state;
  }
  const redone = followTrackChanges(
    { ...state, document: { ...state.document, song: next }, past: [...state.past, state.document.song].slice(-HISTORY_LIMIT), future: rest, notice: undefined, hint: undefined },
    state.document.song,
    next,
  );
  return { ...redone, cursor: redone.cursor === undefined ? undefined : clampCursor(next, redone.cursor) };
}

/** What a save wrote: the file's new name and path, the song it now holds, what its format left out. */
export interface SavedDocument {
  readonly fileName: string;
  readonly path: string;
  readonly song: Song;
  readonly hint?: string;
}

/** The document under its new file name; the hint strip says what this save left out (or nothing). */
export function markSaved(state: EditorState, { fileName, path, song, hint }: SavedDocument): EditorState {
  return state.document === undefined ? state : { ...state, document: { ...state.document, fileName, path }, savedSong: song, hint };
}
