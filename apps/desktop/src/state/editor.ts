import {
  type NoteAddress,
  type Song,
  deleteNote,
  findNote,
  setNoteFret,
  setNoteString,
} from '@gp-editor/core';

/** Undo depth kept in memory. */
export const HISTORY_LIMIT = 200;

export interface OpenDocument {
  readonly fileName: string;
  readonly path: string;
  readonly song: Song;
}

export interface EditorState {
  readonly document?: OpenDocument;
  readonly past: readonly Song[];
  readonly future: readonly Song[];
  readonly trackIndex: number;
  readonly selection?: NoteAddress;
  readonly isLoading: boolean;
  readonly error?: string;
}

export type EditorAction =
  | { readonly type: 'loadStarted' }
  | { readonly type: 'loadCancelled' }
  | { readonly type: 'loaded'; readonly document: OpenDocument }
  | { readonly type: 'loadFailed'; readonly message: string }
  | { readonly type: 'dismissError' }
  | { readonly type: 'selectTrack'; readonly trackIndex: number }
  | { readonly type: 'selectNote'; readonly address?: NoteAddress }
  | { readonly type: 'setNoteFret'; readonly fret: number }
  | { readonly type: 'shiftNoteFret'; readonly delta: number }
  | { readonly type: 'shiftNoteString'; readonly delta: number }
  | { readonly type: 'deleteNote' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

export const INITIAL_EDITOR_STATE: EditorState = {
  past: [],
  future: [],
  trackIndex: 0,
  isLoading: false,
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, isLoading: true, error: undefined };
    case 'loadCancelled':
      return { ...state, isLoading: false };
    case 'loaded':
      return { ...INITIAL_EDITOR_STATE, document: action.document };
    case 'loadFailed':
      return { ...state, isLoading: false, error: action.message };
    case 'dismissError':
      return { ...state, error: undefined };
    case 'selectTrack':
      return selectTrack(state, action.trackIndex);
    case 'selectNote':
      return { ...state, selection: action.address };
    case 'setNoteFret':
      return applyEdit(state, (song, at) => setNoteFret(song, at, action.fret));
    case 'shiftNoteFret':
      return applyEdit(state, (song, at) => setNoteFret(song, at, (findNote(song, at)?.fret ?? 0) + action.delta));
    case 'shiftNoteString':
      return applyEdit(state, (song, at) => setNoteString(song, at, (findNote(song, at)?.string ?? 0) + action.delta));
    case 'deleteNote':
      return applyEdit(state, deleteNote);
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
  }
}

function selectTrack(state: EditorState, trackIndex: number): EditorState {
  const trackCount = state.document?.song.tracks.length ?? 0;
  if (trackIndex < 0 || trackIndex >= trackCount) {
    return state;
  }
  return { ...state, trackIndex, selection: undefined };
}

/** Runs an edit on the selected note and records the previous song for undo. */
function applyEdit(state: EditorState, edit: (song: Song, at: NoteAddress) => Song): EditorState {
  const { document, selection } = state;
  if (document === undefined || selection === undefined) {
    return state;
  }
  const next = edit(document.song, selection);
  if (next === document.song) {
    return state;
  }
  return {
    ...state,
    document: { ...document, song: next },
    past: [...state.past, document.song].slice(-HISTORY_LIMIT),
    future: [],
    selection: findNote(next, selection) === undefined ? undefined : selection,
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
    selection: keptSelection(previous, state.selection),
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
    selection: keptSelection(next, state.selection),
  };
}

/** Keep the user's place across undo/redo when the selected note exists in the restored song. */
function keptSelection(song: Song, selection: NoteAddress | undefined): NoteAddress | undefined {
  return selection !== undefined && findNote(song, selection) !== undefined ? selection : undefined;
}
