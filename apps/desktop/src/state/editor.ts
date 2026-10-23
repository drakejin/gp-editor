import {
  type Beat,
  type BeatFragment,
  type Effect,
  type Lyrics,
  type MasterMix,
  type PlayedNote,
  type Song,
  type SongInfo,
  type StringAddress,
  type TranspositionOptions,
  type TranspositionScope,
  buildNewSong,
  deleteNote,
  enterPlayedNotes,
  findNote,
  insertMeasure,
  setNoteFret,
  setNoteString,
  setMasterMix,
  setSongInfo,
  setTrackBalance,
  setTrackCapo,
  setTrackEffects,
  setTrackLyrics,
  setTrackMute,
  setTrackName,
  setTrackProgram,
  setTrackSolo,
  setTrackTuning,
  setTrackVolume,
  toggleDrumNote,
  transpose,
} from '@gp-editor/core';
import {
  adjacentBeat,
  adjacentString,
  clampCursor,
  firstCursor,
} from '../lib/navigation';
import { retuneNotice } from '../lib/tuning-hint';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import { type AudioTrackAction, applyAudioTrackAction } from './audio-track-edits';
import { type SongEdit, applySongEdit } from './song-edits';
import { withSelectionStart } from './mark-edits';
import { DRONE_FRET_HINT, playedNotesHint, storedFret } from './note-entry';
import { refusalHint } from './edit-hints';
import { transpositionHint } from './transposition';
import {
  type ClipboardEdit,
  cutSelectionAt,
  extendSelection,
  selectTo,
  pasteBeatsAt,
  pasteRefusal,
  settleSelection,
} from './selection';

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
  /**
   * Where the selection started (extendSelection): the beats from here to the cursor, in the cursor's voice, are
   * selected. Gone after any other cursor move, an edit or another track.
   */
  readonly selectionAnchor?: StringAddress;
  readonly mode: ScoreMode;
  /** What this score shows of its chords (the track inspector's Chords toggles); names and diagrams for a new score. */
  readonly chordDisplay: ChordDisplay;
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
  /** The track's playback effects in order (saved in .gp files); an empty chain removes them. */
  | { readonly type: 'setTrackEffects'; readonly trackIndex: number; readonly effects: readonly Effect[] }
  /** The master strip on the whole mix. */
  | { readonly type: 'setMasterMix'; readonly master: MasterMix }
  /** The track's lyrics (Edit ▸ Lyrics…); a blank text takes them away. */
  | { readonly type: 'setTrackLyrics'; readonly trackIndex: number; readonly lyrics: Lyrics }
  | { readonly type: 'setSongInfo'; readonly info: Partial<SongInfo> };

export type EditorAction =
  | SongAction
  | AudioTrackAction
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
  /** Writing a PDF (File ▸ Export PDF…) failed, or `what` another export wrote ("the MIDI file"). */
  | { readonly type: 'exportFailed'; readonly message: string; readonly what?: string }
  | { readonly type: 'dismissError' }
  /** A hint from outside the reducer (B / C on an empty string). */
  | { readonly type: 'showHint'; readonly hint: string }
  | { readonly type: 'selectTrack'; readonly trackIndex: number }
  | { readonly type: 'setMode'; readonly mode: ScoreMode }
  | { readonly type: 'setChordDisplay'; readonly display: ChordDisplay }
  | { readonly type: 'placeCursor'; readonly cursor: StringAddress }
  | { readonly type: 'moveCursorBeat'; readonly step: -1 | 1 }
  | { readonly type: 'moveCursorString'; readonly delta: number }
  /** The cursor on voice 1 (0) or 2 (1) of the same beat. */
  | { readonly type: 'selectVoice'; readonly voiceIndex: number }
  /** A fret as the tab shows it (a banjo's short 5th string counts from the main nut). */
  | { readonly type: 'setNoteFret'; readonly fret: number }
  /** A drum kit piece clicked: its GM key into the cursor's beat, or out of it when the beat already plays it. */
  | { readonly type: 'toggleDrumNote'; readonly key: number }
  /** MIDI step entry: notes played together become the cursor's beat (one undo step); the cursor goes to the next beat. */
  | { readonly type: 'enterPlayedNotes'; readonly notes: readonly PlayedNote[] }
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
  /** The cursor a beat further (as moveCursorBeat), keeping the selection's start where the cursor was. */
  | { readonly type: 'extendSelection'; readonly step: -1 | 1 }
  /** A mouse drag or a shift-click: select from where the cursor was to here. */
  | { readonly type: 'selectTo'; readonly cursor: StringAddress }
  | { readonly type: 'clearSelection' }
  /** Deletes the selected beats (the cursor's beat when none are selected); what follows moves up. One undo step. */
  | { readonly type: 'cutSelection' }
  /** Inserts beats at the cursor; what follows moves on. One undo step. */
  | { readonly type: 'pasteBeats'; readonly fragment: BeatFragment }
  /** The system clipboard could not be read or written. */
  | { readonly type: 'clipboardFailed'; readonly message: string }
  | { readonly type: 'edit'; readonly edit: SongEdit }
  /** Tools ▸ Transpose…: one undo step; the hint strip tells what moved and what could not. */
  | { readonly type: 'transpose'; readonly scope: TranspositionScope; readonly options: TranspositionOptions }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

export const INITIAL_EDITOR_STATE: EditorState = {
  past: [],
  future: [],
  trackIndex: 0,
  mode: 'notationAndTab',
  chordDisplay: DEFAULT_CHORD_DISPLAY,
  isLoading: false,
};

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  return settleSelection(state, reduceEditor(state, action), action);
}

function reduceEditor(state: EditorState, action: EditorAction): EditorState {
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
      return { ...state, error: `Could not export ${action.what ?? 'the PDF'}: ${action.message}` };
    case 'clipboardFailed':
      return { ...state, error: `Could not use the clipboard: ${action.message}` };
    case 'loadFailed':
      return {
        ...state,
        isLoading: false,
        error: openFailedMessage(action.message),
      };
    case 'dismissError':
      return { ...state, error: undefined };
    case 'dismissNotice':
      return { ...state, notice: undefined };
    case 'showHint':
      return state.hint === action.hint ? state : { ...state, hint: action.hint };
    case 'dismissHint':
      return state.hint === undefined ? state : { ...state, hint: undefined };
    case 'selectTrack':
      return selectTrack(state, action.trackIndex);
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'setChordDisplay':
      return { ...state, chordDisplay: action.display };
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
    case 'extendSelection':
      return extendSelection(state, action.step);
    case 'selectTo':
      return selectTo(state, action.cursor);
    case 'clearSelection':
      return state.selectionAnchor === undefined ? state : { ...state, selectionAnchor: undefined };
    default:
      return editReducer(state, action);
  }
}

function editReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setNoteFret':
      return typeFret(state, action.fret);
    case 'toggleDrumNote':
      return followBeatStart(state, applyEdit(state, (song, at) => toggleDrumNote(song, at, action.key)));
    case 'enterPlayedNotes':
      return enterPlayed(state, action.notes);
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
    case 'setTrackLyrics':
    case 'setTrackEffects':
    case 'setMasterMix':
    case 'setSongInfo':
      return state.document === undefined
        ? state
        : recordSong(
            state,
            state.document,
            applySongAction(state.document.song, action),
          );
    case 'setAudioTrack':
    case 'setAudioTrackMix':
    case 'setAudioSyncPoint':
    case 'deleteAudioSyncPoint':
    case 'moveAudioSyncPoint':
    case 'setTempoFromAudio':
      return applyAudioAction(state, action);
    case 'edit':
      return applyCursorEdit(state, withSelectionStart(action.edit, state.selectionAnchor));
    case 'cutSelection':
      return applyClipboardEdit(state, (song, cursor) => cutSelectionAt(song, cursor, state.selectionAnchor));
    case 'pasteBeats':
      return pasteBeats(state, action.fragment);
    case 'transpose':
      return transposeSong(state, action.scope, action.options);
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
    case 'setTrackLyrics':
      return setTrackLyrics(song, action.trackIndex, action.lyrics);
    case 'setTrackEffects':
      return setTrackEffects(song, action.trackIndex, action.effects);
    case 'setMasterMix':
      return setMasterMix(song, action.master);
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

/** A typed fret at the cursor; a fret the string does not have (below a banjo drone's peg) leaves a hint instead. */
function typeFret(state: EditorState, typed: number): EditorState {
  const { document, cursor } = state;
  const fret = document === undefined || cursor === undefined ? typed : storedFret(document.song, cursor, typed);
  if (fret === undefined) {
    return { ...state, hint: DRONE_FRET_HINT };
  }
  const typedState = followBeatStart(state, applyEdit(state, (song, at) => setNoteFret(song, at, fret)));
  return typedState.hint === DRONE_FRET_HINT ? { ...typedState, hint: undefined } : typedState;
}

/** MIDI step entry at the cursor: the played notes become its beat, then the cursor steps on; a hint names what was left out. */
function enterPlayed(state: EditorState, notes: readonly PlayedNote[]): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  const entry = enterPlayedNotes(document.song, cursor, notes);
  const hint = playedNotesHint(entry.skipped);
  const entered = followBeatStart(state, recordSong(state, document, entry.song));
  if (entered === state || entered.cursor === undefined || entered.document === undefined) {
    return hint === undefined ? state : { ...state, hint };
  }
  const next = adjacentBeat(entry.song, entered.cursor, 1);
  if (next !== entered.cursor) {
    return { ...entered, cursor: next, hint };
  }
  // The song's last beat: a new bar to go on writing in, in the same undo step.
  const song = insertMeasure(entry.song, next.measureIndex, 'after');
  const cursorInNewBar = clampCursor(song, { ...next, measureIndex: next.measureIndex + 1, beatIndex: 0 });
  return { ...entered, document: { ...entered.document, song }, cursor: cursorInNewBar, hint };
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

/** A cut or paste (one undo step): the cursor goes where the edit says, the selection is gone. */
function applyClipboardEdit(
  state: EditorState,
  edit: (song: Song, cursor: StringAddress) => ClipboardEdit,
): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  const result = edit(document.song, cursor);
  const recorded = recordSong(state, document, result.song);
  return recorded === state
    ? state
    : { ...recorded, cursor: result.cursor, selectionAnchor: undefined, hint: undefined };
}

/** Pastes at the cursor; when the beats cannot go there (drums and other tracks), the hint says why. */
function pasteBeats(state: EditorState, fragment: BeatFragment): EditorState {
  const pasted = applyClipboardEdit(state, (song, cursor) => pasteBeatsAt(song, cursor, fragment));
  const { document, cursor } = state;
  const hint =
    pasted !== state || document === undefined || cursor === undefined
      ? undefined
      : pasteRefusal(document.song, cursor, fragment);
  return hint === undefined || hint === state.hint ? pasted : { ...state, hint };
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
/** An audio track edit (one undo step), and its hint when it says why nothing changed or what did. */
function applyAudioAction(state: EditorState, action: AudioTrackAction): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const result = applyAudioTrackAction(document.song, action);
  const recorded = recordSong(state, document, result.song);
  return result.hint === undefined ? recorded : { ...recorded, hint: result.hint };
}

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

/** Transposes (one undo step); the hint strip says what moved, also when nothing could. */
function transposeSong(state: EditorState, scope: TranspositionScope, options: TranspositionOptions): EditorState {
  const { document } = state;
  if (document === undefined) {
    return state;
  }
  const result = transpose(document.song, scope, options);
  return { ...recordSong(state, document, result.song), hint: transpositionHint(result, options) };
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

/** The error banner's text for a file that could not be opened. */
export function openFailedMessage(message: string): string {
  return `Could not open the file: ${message}`;
}

/** True when the open song differs from the one last opened or saved. */
export function isEdited(state: EditorState): boolean {
  return (
    state.document !== undefined && state.document.song !== state.savedSong
  );
}
