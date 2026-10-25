import {
  type Beat,
  type BeatFragment,
  type PlayedNote,
  type Song,
  type StringAddress,
  deleteNote,
  enterPlayedNotes,
  findNote,
  insertMeasure,
  setNoteFret,
  setNoteString,
  toggleDrumNote,
  voiceOf,
} from '@gp-editor/core';
import { adjacentBeat, clampCursor, firstCursor } from '../lib/navigation';
import { refusalHint } from './edit-hints';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { withSelectionStart } from './mark-edits';
import { droneFretHint, playedNotesHint, storedFret } from './note-entry';
import { type ClipboardEdit, cutSelectionAt, pasteBeatsAt, pasteRefusal } from './selection';
import { type SongEdit, applySongEdit } from './song-edits';

// The editor's edits at the cursor (editor.ts routes the actions here): the cursor follows what they insert or remove.

function cursorBeat(state: EditorState, cursor: StringAddress): Beat | undefined {
  return state.document?.song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
}

/** Runs an edit at the cursor and records the previous song for undo. */
function applyEdit(state: EditorState, edit: (song: Song, at: StringAddress) => Song): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  return recordSong(state, document, edit(document.song, cursor));
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
  const beats = after.document?.song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats ?? [];
  const beatIndex = beats.findIndex((beat) => beat.start === start);
  return beatIndex < 0 || beatIndex === cursor.beatIndex ? after : { ...after, cursor: { ...cursor, beatIndex } };
}

/** The cursor on another voice (1–4) of the same beat, also one the beat has no slot for yet; the same state past voice 4. */
export function selectVoice(state: EditorState, voiceIndex: number): EditorState {
  const { cursor } = state;
  const beat = cursor === undefined ? undefined : cursorBeat(state, cursor);
  const isSelectable = beat !== undefined && voiceOf(beat, voiceIndex) !== undefined;
  if (cursor === undefined || !isSelectable || cursor.voiceIndex === voiceIndex) {
    return state;
  }
  return { ...state, cursor: { ...cursor, voiceIndex } };
}

/** The cursor moved within the song (from the first beat of the shown track when it has none yet). */
export function withCursor(state: EditorState, move: (song: Song, cursor: StringAddress) => StringAddress): EditorState {
  const song = state.document?.song;
  const current = state.cursor ?? (song === undefined ? undefined : firstCursor(song, state.trackIndex));
  if (song === undefined || current === undefined) {
    return state;
  }
  return { ...state, cursor: clampCursor(song, move(song, current)) };
}

/** A typed fret at the cursor; a fret the string does not have (below a banjo drone's peg) leaves a hint instead. */
export function typeFret(state: EditorState, typed: number): EditorState {
  const { document, cursor } = state;
  const fret = document === undefined || cursor === undefined ? typed : storedFret(document.song, cursor, typed);
  if (fret === undefined) {
    return { ...state, hint: droneFretHint() };
  }
  const typedState = followBeatStart(state, applyEdit(state, (song, at) => setNoteFret(song, at, fret)));
  return typedState.hint === droneFretHint() ? { ...typedState, hint: undefined } : typedState;
}

/** A drum kit piece clicked: its GM key into the cursor's beat, or out of it when the beat already plays it. */
export function toggleDrumAtCursor(state: EditorState, key: number): EditorState {
  return followBeatStart(state, applyEdit(state, (song, at) => toggleDrumNote(song, at, key)));
}

/** − / =: the note at the cursor a fret lower or higher. */
export function shiftNoteFret(state: EditorState, delta: number): EditorState {
  return applyEdit(state, (song, at) => {
    const note = findNote(song, at);
    return note === undefined ? song : setNoteFret(song, at, note.fret + delta);
  });
}

/** Option-↑/↓: move the note at the cursor to the neighbouring string; the cursor follows it. */
export function shiftNoteString(state: EditorState, delta: number): EditorState {
  const { cursor } = state;
  if (cursor === undefined) {
    return state;
  }
  const edited = applyEdit(state, (song, at) => setNoteString(song, at, at.string + delta));
  return edited === state ? state : { ...edited, cursor: { ...cursor, string: cursor.string + delta } };
}

export function deleteNoteAtCursor(state: EditorState): EditorState {
  return applyEdit(state, deleteNote);
}

/** MIDI step entry at the cursor: the played notes become its beat, then the cursor steps on; a hint names what was left out. */
export function enterPlayed(state: EditorState, notes: readonly PlayedNote[]): EditorState {
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

/** Where the cursor goes after an edit: on past an inserted beat or bar, and inside the song after deletions. */
function cursorAfter(song: Song, cursor: StringAddress, edit: SongEdit): StringAddress | undefined {
  if (edit.type === 'insertBeat') {
    return clampCursor(song, { ...cursor, beatIndex: cursor.beatIndex + 1 });
  }
  return clampCursor(song, edit.type === 'insertMeasure' ? { ...cursor, measureIndex: cursor.measureIndex + 1, beatIndex: 0 } : cursor);
}

/**
 * A cursor edit (from the selection's start when beats are selected); the cursor follows inserted beats and measures and
 * stays inside the song after deletions, and stays on its beat where notes moved to another voice, or a chord into an
 * empty voice, add rests before it. An edit that changes nothing leaves a hint saying why.
 */
export function applyCursorEdit(state: EditorState, cursorEdit: SongEdit): EditorState {
  const edit = withSelectionStart(cursorEdit, state.selectionAnchor);
  const applied = applyEdit(state, (song, at) => applySongEdit(song, at, edit));
  const edited = edit.type === 'moveToVoice' || (edit.type === 'setBeatChord' && edit.withNotes === true) ? followBeatStart(state, applied) : applied;
  if (edited === state) {
    const hint = state.document === undefined || state.cursor === undefined ? undefined : refusalHint(state.document.song, state.cursor, edit);
    return hint === state.hint ? state : { ...state, hint };
  }
  const song = edited.document?.song;
  if (song === undefined || edited.cursor === undefined) {
    return { ...edited, hint: undefined };
  }
  return { ...edited, cursor: cursorAfter(song, edited.cursor, edit), hint: undefined };
}

/** A cut or paste (one undo step): the cursor goes where the edit says, the selection is gone. */
function applyClipboardEdit(state: EditorState, edit: (song: Song, cursor: StringAddress) => ClipboardEdit): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined) {
    return state;
  }
  const result = edit(document.song, cursor);
  const recorded = recordSong(state, document, result.song);
  return recorded === state ? state : { ...recorded, cursor: result.cursor, selectionAnchor: undefined, hint: undefined };
}

/** Deletes the selected beats (the cursor's beat when none are selected); what follows moves up. */
export function cutSelection(state: EditorState): EditorState {
  return applyClipboardEdit(state, (song, cursor) => cutSelectionAt(song, cursor, state.selectionAnchor));
}

/** Pastes at the cursor; when the beats cannot go there (drums and other tracks), the hint says why. */
export function pasteBeats(state: EditorState, fragment: BeatFragment): EditorState {
  const pasted = applyClipboardEdit(state, (song, cursor) => pasteBeatsAt(song, cursor, fragment));
  const { document, cursor } = state;
  const hint = pasted !== state || document === undefined || cursor === undefined ? undefined : pasteRefusal(document.song, cursor, fragment);
  return hint === undefined || hint === state.hint ? pasted : { ...state, hint };
}
