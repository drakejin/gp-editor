import { type PlayedNote, type BeatFragment, type Song, type StringAddress, type TranspositionOptions, type TranspositionScope, buildNewSong } from '@gp-editor/core';
import { adjacentBeat, firstCursor, voiceWithNoteAt } from '../lib/navigation';
import { t } from '../lib/i18n/i18n';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import type { AudioTrackAction } from './audio-track-edits';
import {
  applyCursorEdit,
  cutSelection,
  deleteNoteAtCursor,
  enterPlayed,
  pasteBeats,
  selectVoice,
  shiftNoteFret,
  shiftNoteString,
  toggleDrumAtCursor,
  typeFret,
  withCursor,
} from './cursor-edits';
import { editAudioTrack, editLayout, editSong, editTracks, retune, selectTrack, transposeSong } from './document-edits';
import { markSaved, redo, undo } from './editor-history';
import { type LayoutAction, isLayoutAction } from './layout-edits';
import { type TrackDisplayAction, moveCursorString, placeCursor, reduceTrackDisplay, setScoreMode } from './multitrack';
import { extendSelection, selectTo, settleSelection } from './selection';
import { type SongAction, isSongAction } from './song-actions';
import type { SongEdit } from './song-edits';
import { INITIAL_TRACK_DISPLAY, type TrackDisplay } from './track-display';
import type { TrackAction } from './track-edits';

// The shown tab's editor: its document, undo history, cursor and selection, view and hints, and the reducer routing each
// action to the edits of cursor-edits.ts (at the cursor), document-edits.ts (the song, a track) and editor-history.ts.

/** File name of a new sheet until it is saved (Save suggests "Untitled.gp5"), in the language shown when it is made. */
function newDocumentName(): string {
  return t('common.untitled');
}

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
  /** The tracks the score shows (View ▸ Multitrack, the tracks panel's eyes) and their staves in the multitrack view. */
  readonly trackDisplay: TrackDisplay;
  /** What this score shows of its chords (the track inspector's Chords toggles); names and diagrams for a new score. */
  readonly chordDisplay: ChordDisplay;
  readonly isLoading: boolean;
  readonly error?: string;
  /** What the last retune could not keep (notes moved by octaves or left out); shown under the neck settings. */
  readonly notice?: string;
  /** Why the last edit at the cursor changed nothing (e.g. a shorter time signature for a full bar). */
  readonly hint?: string;
  /** Guitar Pro 8's multivoice edition: no voice faded, and a click on a note puts the cursor in that note's voice. */
  readonly isMultivoice?: boolean;
  /** Guitar Pro 8's Design Mode (View ▸ Design Mode): the score's handles to move beats, bar lines and systems. */
  readonly isDesignMode?: boolean;
}

export type EditorAction =
  | SongAction
  | LayoutAction
  | { readonly type: 'toggleDesignMode' }
  | AudioTrackAction
  | TrackAction
  | TrackDisplayAction
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
  /** The cursor on voice 1 (0) to 4 (3) of the same beat (⌘1–⌘4, the palette's Voice buttons). */
  | { readonly type: 'selectVoice'; readonly voiceIndex: number }
  | { readonly type: 'toggleMultivoice' }
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
  trackDisplay: INITIAL_TRACK_DISPLAY,
  chordDisplay: DEFAULT_CHORD_DISPLAY,
  isLoading: false,
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return settleSelection(state, reduceEditor(state, action), action);
}

/** Opening, saving, errors and hints. */
function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, isLoading: true, error: undefined };
    case 'loadCancelled':
      return { ...state, isLoading: false };
    case 'loaded':
      return openDocument(action.document, state.mode);
    case 'created':
      return openDocument({ fileName: newDocumentName(), path: '', song: buildNewSong() }, action.mode);
    case 'saved':
      return markSaved(state, action.fileName, action.path, action.song);
    case 'saveFailed':
      return { ...state, error: t('palette.error.save', { message: action.message }) };
    case 'exportFailed':
      return { ...state, error: t('palette.error.export', { what: action.what ?? t('palette.error.thePdf'), message: action.message }) };
    case 'clipboardFailed':
      return { ...state, error: t('palette.error.clipboard', { message: action.message }) };
    case 'loadFailed':
      return { ...state, isLoading: false, error: openFailedMessage(action.message) };
    case 'dismissError':
      return { ...state, error: undefined };
    case 'dismissNotice':
      return { ...state, notice: undefined };
    case 'showHint':
      return state.hint === action.hint ? state : { ...state, hint: action.hint };
    case 'dismissHint':
      return state.hint === undefined ? state : { ...state, hint: undefined };
    default:
      return viewReducer(state, action);
  }
}

/** The shown track and how the score shows it. */
function viewReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'selectTrack':
      return selectTrack(state, action.trackIndex);
    case 'setMode':
      return setScoreMode(state, action.mode);
    case 'toggleMultitrack':
    case 'toggleTrackShown':
    case 'moveCursorTrack':
      return reduceTrackDisplay(state, action);
    case 'setChordDisplay':
      return { ...state, chordDisplay: action.display };
    case 'toggleDesignMode':
      return { ...state, isDesignMode: state.isDesignMode !== true };
    default:
      return cursorReducer(state, action);
  }
}

function cursorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'placeCursor':
      return placeCursor(state, state.isMultivoice === true && state.document !== undefined ? voiceWithNoteAt(state.document.song, action.cursor) : action.cursor);
    case 'moveCursorBeat':
      return withCursor(state, (song, cursor) => adjacentBeat(song, cursor, action.step));
    case 'moveCursorString':
      return moveCursorString(state, action.delta);
    case 'selectVoice':
      return selectVoice(state, action.voiceIndex);
    case 'toggleMultivoice':
      return { ...state, isMultivoice: state.isMultivoice !== true };
    case 'extendSelection':
      return extendSelection(state, action.step);
    case 'selectTo':
      return selectTo(state, action.cursor);
    case 'clearSelection':
      return state.selectionAnchor === undefined ? state : { ...state, selectionAnchor: undefined };
    default:
      return cursorEditReducer(state, action);
  }
}

/** Edits at the cursor (one undo step each). */
function cursorEditReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setNoteFret':
      return typeFret(state, action.fret);
    case 'toggleDrumNote':
      return toggleDrumAtCursor(state, action.key);
    case 'enterPlayedNotes':
      return enterPlayed(state, action.notes);
    case 'shiftNoteFret':
      return shiftNoteFret(state, action.delta);
    case 'shiftNoteString':
      return shiftNoteString(state, action.delta);
    case 'deleteNote':
      return deleteNoteAtCursor(state);
    case 'edit':
      return applyCursorEdit(state, action.edit);
    case 'cutSelection':
      return cutSelection(state);
    case 'pasteBeats':
      return pasteBeats(state, action.fragment);
    default:
      return songEditReducer(state, action);
  }
}

/** Edits of the song, a track, its audio track or its layout (one undo step each), undo and redo. */
function songEditReducer(state: EditorState, action: EditorAction): EditorState {
  if (isSongAction(action)) {
    return editSong(state, action);
  }
  if (isLayoutAction(action)) {
    return editLayout(state, action);
  }
  switch (action.type) {
    case 'setTrackTuning':
      return retune(state, action.trackIndex, action.tuning);
    case 'setAudioTrack':
    case 'setAudioTrackMix':
    case 'setAudioSyncPoint':
    case 'deleteAudioSyncPoint':
    case 'moveAudioSyncPoint':
    case 'setTempoFromAudio':
      return editAudioTrack(state, action);
    case 'addTrack':
    case 'duplicateTrack':
    case 'deleteTrack':
    case 'moveTrack':
      return editTracks(state, action);
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

/** A fresh editor (no history, cursor on the first beat) for a document just opened or created. */
function openDocument(document: OpenDocument, mode: ScoreMode): EditorState {
  return { ...INITIAL_EDITOR_STATE, mode, document, savedSong: document.song, cursor: firstCursor(document.song, 0) };
}

/** The error banner's text for a file that could not be opened. */
export function openFailedMessage(message: string): string {
  return t('palette.error.open', { message });
}

/** True when the open song differs from the one last opened or saved. */
export function isEdited(state: EditorState): boolean {
  return state.document !== undefined && state.document.song !== state.savedSong;
}
