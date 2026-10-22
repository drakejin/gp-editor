import {
  type Beat,
  type Song,
  type SongInfo,
  type StringAddress,
  buildNewSong,
  deleteNote,
  findNote,
  setNoteFret,
  setNoteString,
  setSongInfo,
  setTrackBalance,
  setTrackCapo,
  setTrackMute,
  setTrackName,
  setTrackProgram,
  setTrackSolo,
  setTrackTuning,
  setTrackVolume,
} from '@gp-editor/core';
import {
  adjacentBeat,
  adjacentString,
  clampCursor,
  firstCursor,
} from '../lib/navigation';
import { retuneNotice } from '../lib/tuning-hint';
import type { ScoreMode } from '../score/geometry';
import { type SongEdit, applySongEdit } from './song-edits';
import { refusalHint } from './edit-hints';

/** Undo depth kept in memory. */
export const HISTORY_LIMIT = 200;
/** Voices the cursor can be on: Guitar Pro 5 files hold two per beat. */
const SELECTABLE_VOICES = 2;
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
  /** What the last retune could not keep (notes moved by octaves or left out); shown under the neck settings. */
  readonly notice?: string;
  /** Why the last edit at the cursor changed nothing (e.g. a shorter time signature for a full bar). */
  readonly hint?: string;
}

/** Edits of one track or of the song itself, not at the cursor; each is one undo step. */
type SongAction =
  /** The General MIDI instrument a track plays (saved with the song). */
  | { readonly type: 'setTrackProgram'; readonly trackIndex: number; readonly program: number }
  | { readonly type: 'setTrackName'; readonly trackIndex: number; readonly name: string }
  | { readonly type: 'setTrackMute'; readonly trackIndex: number; readonly isMute: boolean }
  | { readonly type: 'setTrackSolo'; readonly trackIndex: number; readonly isSolo: boolean }
  /** 0–127, on the track's channel (a channel shared with another track is copied first). */
  | { readonly type: 'setTrackVolume'; readonly trackIndex: number; readonly volume: number }
  /** Pan 0–127 (64 = centre), as the volume. */
  | { readonly type: 'setTrackBalance'; readonly trackIndex: number; readonly balance: number }
  /** Capo fret 0–24; the frets stay as written. */
  | { readonly type: 'setTrackCapo'; readonly trackIndex: number; readonly capo: number }
  | { readonly type: 'setSongInfo'; readonly info: Partial<SongInfo> };

export type EditorAction =
  | SongAction
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
  /** Writing a PDF (File ▸ Export PDF…) failed. */
  | { readonly type: 'exportFailed'; readonly message: string }
  | { readonly type: 'dismissError' }
  | { readonly type: 'selectTrack'; readonly trackIndex: number }
  | { readonly type: 'setMode'; readonly mode: ScoreMode }
  | { readonly type: 'placeCursor'; readonly cursor: StringAddress }
  | { readonly type: 'moveCursorBeat'; readonly step: -1 | 1 }
  | { readonly type: 'moveCursorString'; readonly delta: number }
  /** The cursor on voice 1 (0) or 2 (1) of the same beat. */
  | { readonly type: 'selectVoice'; readonly voiceIndex: number }
  | { readonly type: 'setNoteFret'; readonly fret: number }
  | { readonly type: 'shiftNoteFret'; readonly delta: number }
  | { readonly type: 'shiftNoteString'; readonly delta: number }
  | { readonly type: 'deleteNote' }
  /** Neck settings: the track on new strings, every note re-fretted to keep its pitch. */
  | {
      readonly type: 'setTrackTuning';
      readonly trackIndex: number;
      readonly tuning: readonly number[];
    }
  | { readonly type: 'dismissNotice' }
  | { readonly type: 'dismissHint' }
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
      return markSaved(state, action.fileName, action.path, action.song);
    case 'saveFailed':
      return { ...state, error: `Could not save: ${action.message}` };
    case 'exportFailed':
      return { ...state, error: `Could not export the PDF: ${action.message}` };
    case 'loadFailed':
      return {
        ...state,
        isLoading: false,
        error: `Could not open the file: ${action.message}`,
      };
    case 'dismissError':
      return { ...state, error: undefined };
    case 'dismissNotice':
      return { ...state, notice: undefined };
    case 'dismissHint':
      return state.hint === undefined ? state : { ...state, hint: undefined };
    case 'selectTrack':
      return selectTrack(state, action.trackIndex);
    case 'setMode':
      return { ...state, mode: action.mode };
    default:
      return cursorReducer(state, action);
  }
}

function cursorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
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
    case 'selectVoice':
      return selectVoice(state, action.voiceIndex);
    default:
      return editReducer(state, action);
  }
}

function editReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setNoteFret':
      return followBeatStart(
        state,
        applyEdit(state, (song, at) => setNoteFret(song, at, action.fret)),
      );
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
    case 'setTrackTuning':
      return retune(state, action.trackIndex, action.tuning);
    case 'setTrackProgram':
    case 'setTrackName':
    case 'setTrackMute':
    case 'setTrackSolo':
    case 'setTrackVolume':
    case 'setTrackBalance':
    case 'setTrackCapo':
    case 'setSongInfo':
      return state.document === undefined
        ? state
        : recordSong(
            state,
            state.document,
            applySongAction(state.document.song, action),
          );
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

function applySongAction(song: Song, action: SongAction): Song {
  switch (action.type) {
    case 'setTrackProgram':
      return setTrackProgram(song, action.trackIndex, action.program);
    case 'setTrackName':
      return setTrackName(song, action.trackIndex, action.name);
    case 'setTrackMute':
      return setTrackMute(song, action.trackIndex, action.isMute);
    case 'setTrackSolo':
      return setTrackSolo(song, action.trackIndex, action.isSolo);
    case 'setTrackVolume':
      return setTrackVolume(song, action.trackIndex, action.volume);
    case 'setTrackBalance':
      return setTrackBalance(song, action.trackIndex, action.balance);
    case 'setTrackCapo':
      return setTrackCapo(song, action.trackIndex, action.capo);
    case 'setSongInfo':
      return setSongInfo(song, action.info);
  }
}

/** The cursor on another voice of the same beat; the same state where the beat has no such voice. */
function selectVoice(state: EditorState, voiceIndex: number): EditorState {
  const { cursor } = state;
  const beat = cursor === undefined ? undefined : cursorBeat(state, cursor);
  const isSelectable =
    Number.isInteger(voiceIndex) &&
    voiceIndex >= 0 &&
    voiceIndex < SELECTABLE_VOICES &&
    beat?.voices[voiceIndex] !== undefined;
  if (cursor === undefined || !isSelectable || cursor.voiceIndex === voiceIndex) {
    return state;
  }
  return { ...state, cursor: { ...cursor, voiceIndex } };
}

function cursorBeat(state: EditorState, cursor: StringAddress): Beat | undefined {
  return state.document?.song.tracks[cursor.trackIndex]?.measures[
    cursor.measureIndex
  ]?.beats[cursor.beatIndex];
}

/**
 * After an edit at the cursor, the cursor on the beat that starts where its beat started: rests a fret typed into an
 * empty voice adds before the note can shift the beat indexes.
 */
function followBeatStart(before: EditorState, after: EditorState): EditorState {
  const { cursor } = before;
  const start = cursor === undefined ? undefined : cursorBeat(before, cursor)?.start;
  if (after === before || cursor === undefined || start === undefined) {
    return after;
  }
  const beats =
    after.document?.song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]
      ?.beats ?? [];
  const beatIndex = beats.findIndex(beat => beat.start === start);
  return beatIndex < 0 || beatIndex === cursor.beatIndex
    ? after
    : { ...after, cursor: { ...cursor, beatIndex } };
}

/** The document under its new file name, `song` being what the file now holds. */
function markSaved(
  state: EditorState,
  fileName: string,
  path: string,
  song: Song,
): EditorState {
  return state.document === undefined
    ? state
    : {
        ...state,
        document: { ...state.document, fileName, path },
        savedSong: song,
      };
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
  if (edited === state) {
    const hint = state.document === undefined || state.cursor === undefined ? undefined : refusalHint(state.document.song, state.cursor, edit);
    return hint === state.hint ? state : { ...state, hint };
  }
  const song = edited.document?.song;
  if (song === undefined || edited.cursor === undefined) {
    return { ...edited, hint: undefined };
  }
  const cursor = edited.cursor;
  const moved =
    edit.type === 'insertBeat'
      ? { ...cursor, beatIndex: cursor.beatIndex + 1 }
      : edit.type === 'insertMeasure'
      ? { ...cursor, measureIndex: cursor.measureIndex + 1, beatIndex: 0 }
      : cursor;
  return { ...edited, cursor: clampCursor(song, moved), hint: undefined };
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
  return recordSong(state, document, edit(document.song, cursor));
}

/** The document with `next` as its song, the previous one kept for undo; the same state when nothing changed. */
function recordSong(
  state: EditorState,
  document: OpenDocument,
  next: Song,
): EditorState {
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

/** Retunes a track (one undo step); the cursor stays on the track's strings and the notice tells what moved. */
function retune(
  state: EditorState,
  trackIndex: number,
  tuning: readonly number[],
): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const change = setTrackTuning(document.song, trackIndex, tuning);
  const recorded = recordSong(state, document, change.song);
  if (recorded === state) {
    return state;
  }
  const cursor =
    state.cursor === undefined
      ? undefined
      : clampCursor(change.song, state.cursor);
  return { ...recorded, cursor, notice: retuneNotice(change) };
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
    notice: undefined,
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
    notice: undefined,
  };
}

/** True when the open song differs from the one last opened or saved. */
export function isEdited(state: EditorState): boolean {
  return (
    state.document !== undefined && state.document.song !== state.savedSong
  );
}
