import {
  type Song,
  type StringAddress,
  buildNewSong,
  deleteNote,
  findNote,
  setNoteFret,
  setNoteString,
} from '@gp-editor/core';
import {
  adjacentBeat,
  adjacentString,
  clampCursor,
  firstCursor,
} from '../lib/navigation';
import type { ScoreMode } from '../score/geometry';
import { type SongEdit, applySongEdit } from './song-edits';

/** Undo depth kept in memory. */
export const HISTORY_LIMIT = 200;
/** File name of a new sheet until it is saved (Save suggests "Untitled.gp5"). */
export const NEW_DOCUMENT_NAME = 'Untitled';

export interface OpenDocument {
  readonly fileName: string;
  readonly path: string;
  readonly song: Song;
}

export interface EditorState {
  readonly document?: OpenDocument;
  /** The song as last opened or saved; the document is edited when its song is a different object. */
  readonly savedSong?: Song;
  readonly past: readonly Song[];
  readonly future: readonly Song[];
  readonly trackIndex: number;
  /** Where edits apply: a string position in a beat, which may hold no note yet. */
  readonly cursor?: StringAddress;
  readonly mode: ScoreMode;
  readonly isLoading: boolean;
  readonly error?: string;
}

export type EditorAction =
  | { readonly type: 'loadStarted' }
  | { readonly type: 'loadCancelled' }
  | { readonly type: 'loaded'; readonly document: OpenDocument }
  /** File ▸ New: a blank sheet shown as score, tab or both. */
  | { readonly type: 'created'; readonly mode: ScoreMode }
  | { readonly type: 'loadFailed'; readonly message: string }
  | {
      readonly type: 'saved';
      readonly fileName: string;
      readonly path: string;
      readonly song: Song;
    }
  | { readonly type: 'saveFailed'; readonly message: string }
  | { readonly type: 'dismissError' }
  | { readonly type: 'selectTrack'; readonly trackIndex: number }
  | { readonly type: 'setMode'; readonly mode: ScoreMode }
  | { readonly type: 'placeCursor'; readonly cursor: StringAddress }
  | { readonly type: 'moveCursorBeat'; readonly step: -1 | 1 }
  | { readonly type: 'moveCursorString'; readonly delta: number }
  | { readonly type: 'setNoteFret'; readonly fret: number }
  | { readonly type: 'shiftNoteFret'; readonly delta: number }
  | { readonly type: 'shiftNoteString'; readonly delta: number }
  | { readonly type: 'deleteNote' }
  | { readonly type: 'edit'; readonly edit: SongEdit }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

export const INITIAL_EDITOR_STATE: EditorState = {
  past: [],
  future: [],
  trackIndex: 0,
  mode: 'notationAndTab',
  isLoading: false,
};

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, isLoading: true, error: undefined };
    case 'loadCancelled':
      return { ...state, isLoading: false };
    case 'loaded':
      return openDocument(action.document, state.mode);
    case 'created':
      return openDocument(
        { fileName: NEW_DOCUMENT_NAME, path: '', song: buildNewSong() },
        action.mode,
      );
    case 'saved':
      return state.document === undefined
        ? state
        : {
            ...state,
            document: {
              ...state.document,
              fileName: action.fileName,
              path: action.path,
            },
            savedSong: action.song,
          };
    case 'saveFailed':
      return { ...state, error: `Could not save: ${action.message}` };
    case 'loadFailed':
      return {
        ...state,
        isLoading: false,
        error: `Could not open the file: ${action.message}`,
      };
    case 'dismissError':
      return { ...state, error: undefined };
    case 'selectTrack':
      return selectTrack(state, action.trackIndex);
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'placeCursor':
      return withCursor(state, () => action.cursor);
    case 'moveCursorBeat':
      return withCursor(state, (song, cursor) =>
        adjacentBeat(song, cursor, action.step),
      );
    case 'moveCursorString':
      return withCursor(state, (song, cursor) =>
        adjacentString(song, cursor, action.delta),
      );
    default:
      return editReducer(state, action);
  }
}

function editReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setNoteFret':
      return applyEdit(state, (song, at) => setNoteFret(song, at, action.fret));
    case 'shiftNoteFret':
      return applyEdit(state, (song, at) => {
        const note = findNote(song, at);
        return note === undefined
          ? song
          : setNoteFret(song, at, note.fret + action.delta);
      });
    case 'shiftNoteString':
      return shiftNoteString(state, action.delta);
    case 'deleteNote':
      return applyEdit(state, deleteNote);
    case 'edit':
      return applyCursorEdit(state, action.edit);
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
    default:
      return state;
  }
}

/** A fresh editor (no history, cursor on the first beat) for a document just opened or created. */
function openDocument(document: OpenDocument, mode: ScoreMode): EditorState {
  return {
    ...INITIAL_EDITOR_STATE,
    mode,
    document,
    savedSong: document.song,
    cursor: firstCursor(document.song, 0),
  };
}

function selectTrack(state: EditorState, trackIndex: number): EditorState {
  const song = state.document?.song;
  if (
    song === undefined ||
    trackIndex < 0 ||
    trackIndex >= song.tracks.length
  ) {
    return state;
  }
  // Keep the place in the song when switching tracks.
  const cursor =
    state.cursor === undefined
      ? firstCursor(song, trackIndex)
      : clampCursor(song, { ...state.cursor, trackIndex });
  return { ...state, trackIndex, cursor };
}

function withCursor(
  state: EditorState,
  move: (song: Song, cursor: StringAddress) => StringAddress,
): EditorState {
  const song = state.document?.song;
  const current =
    state.cursor ??
    (song === undefined ? undefined : firstCursor(song, state.trackIndex));
  if (song === undefined || current === undefined) {
    return state;
  }
  return { ...state, cursor: clampCursor(song, move(song, current)) };
}

/** Option-↑/↓: move the note at the cursor to the neighbouring string; the cursor follows it. */
function shiftNoteString(state: EditorState, delta: number): EditorState {
  const { cursor } = state;
  if (cursor === undefined) {
    return state;
  }
  const edited = applyEdit(state, (song, at) =>
    setNoteString(song, at, at.string + delta),
  );
  return edited === state
    ? state
    : { ...edited, cursor: { ...cursor, string: cursor.string + delta } };
}

/** A cursor edit; the cursor follows inserted beats and measures and stays inside the song after deletions. */
function applyCursorEdit(state: EditorState, edit: SongEdit): EditorState {
  const edited = applyEdit(state, (song, at) => applySongEdit(song, at, edit));
  const song = edited.document?.song;
  if (edited === state || song === undefined || edited.cursor === undefined) {
    return edited;
  }
  const cursor = edited.cursor;
  const moved =
    edit.type === 'insertBeat'
      ? { ...cursor, beatIndex: cursor.beatIndex + 1 }
      : edit.type === 'insertMeasure'
      ? { ...cursor, measureIndex: cursor.measureIndex + 1, beatIndex: 0 }
      : cursor;
  return { ...edited, cursor: clampCursor(song, moved) };
}

/** Runs an edit at the cursor and records the previous song for undo. */
function applyEdit(
  state: EditorState,
  edit: (song: Song, at: StringAddress) => Song,
): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  const next = edit(document.song, cursor);
  if (next === document.song) {
    return state;
  }
  return {
    ...state,
    document: { ...document, song: next },
    past: [...state.past, document.song].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (state.document === undefined || previous === undefined) {
    return state;
  }
  return {
    ...state,
    document: { ...state.document, song: previous },
    past: state.past.slice(0, -1),
    future: [state.document.song, ...state.future],
    cursor:
      state.cursor === undefined
        ? undefined
        : clampCursor(previous, state.cursor),
  };
}

function redo(state: EditorState): EditorState {
  const [next, ...rest] = state.future;
  if (state.document === undefined || next === undefined) {
    return state;
  }
  return {
    ...state,
    document: { ...state.document, song: next },
    past: [...state.past, state.document.song].slice(-HISTORY_LIMIT),
    future: rest,
    cursor:
      state.cursor === undefined ? undefined : clampCursor(next, state.cursor),
  };
}

/** True when the open song differs from the one last opened or saved. */
export function isEdited(state: EditorState): boolean {
  return (
    state.document !== undefined && state.document.song !== state.savedSong
  );
}
