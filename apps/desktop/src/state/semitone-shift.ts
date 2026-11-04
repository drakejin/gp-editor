import { type Note, type Song, type StringAddress, type Track, type TranspositionOptions, findNote, isPercussionTrack, transpose, voiceOf } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { noNoteHint } from './edit-hints';
import type { EditorState } from './editor';
import { recordSong } from './editor-history';
import { hasNotesLeft, transpositionHint, transpositionScope } from './transposition';

// Guitar Pro 8's One semitone up / down (⌥⇧↑ / ⌥⇧↓, the palette's Raise / Lower by a Semitone): the selected notes, or
// the note at the cursor, a semitone higher or lower — gp-core's transpose on that scope, the chords and key left as
// they are (Tools ▸ Transpose… moves those). A note dragged up or down moves the same way, by the drag's semitones.

function semitoneOptions(delta: number): TranspositionOptions {
  return { mode: 'chromatic', amount: delta, isNotesOnly: true };
}

/** A note's sounding pitch on its track (open string, capo, fret). */
function soundingPitch(track: Track, note: Note): number {
  return (track.strings[note.string - 1]?.tuning ?? Number.NaN) + track.offset + note.fret;
}

/**
 * The string the cursor's note went to: the note of the cursor's beat and voice now sounding its pitch `delta` semitones
 * on — on the cursor's string when one there does —; the cursor's own string when none does (it stayed).
 */
function movedNoteString(before: Song, after: Song, cursor: StringAddress, delta: number): number {
  const track = after.tracks[cursor.trackIndex];
  const note = findNote(before, cursor);
  const beat = track?.measures[cursor.measureIndex]?.beats[cursor.beatIndex];
  const notes = beat === undefined ? [] : (voiceOf(beat, cursor.voiceIndex)?.notes ?? []);
  if (track === undefined || note === undefined) {
    return cursor.string;
  }
  const pitch = soundingPitch(track, note) + delta;
  const sounding = notes.filter((each) => soundingPitch(track, each) === pitch);
  return (sounding.find((each) => each.string === cursor.string) ?? sounding[0])?.string ?? cursor.string;
}

function withHint(state: EditorState, hint: string | undefined): EditorState {
  return state.hint === hint ? state : { ...state, hint };
}

/**
 * The selected notes (in the selection's voice), else the note at the cursor with its tied chain, `delta` semitones up
 * (positive) or down — a press ±1, a drag any whole number —: one undo step. A note keeps its string while its fret
 * allows, else goes to a string free on its beat (the cursor goes with its note); one that fits nowhere stays, as does a
 * natural harmonic, and the hint strip says so. The selection stays, for the next press. Drum tracks never move: a drum
 * note's fret is its drum. No semitones (a drag let go where it began) change nothing.
 */
export function shiftPitch(state: EditorState, delta: number): EditorState {
  const { document, cursor } = state;
  if (document === undefined || cursor === undefined || delta === 0 || !Number.isInteger(delta)) {
    return state;
  }
  const { song } = document;
  const track = song.tracks[cursor.trackIndex];
  if (track !== undefined && isPercussionTrack(song, track)) {
    return withHint(state, t('palette.hint.semitoneDrums'));
  }
  const selection = transpositionScope(state, 'selection');
  const options = semitoneOptions(delta);
  const result = transpose(song, selection ?? { kind: 'note', at: cursor }, options);
  if (result.moved === 0 && !hasNotesLeft(result)) {
    return withHint(state, selection === undefined ? noNoteHint(cursor.string) : t('palette.hint.noNoteInSelection'));
  }
  const recorded = recordSong(state, document, result.song);
  const string = movedNoteString(song, result.song, cursor, delta);
  const followed = string === cursor.string ? recorded : { ...recorded, cursor: { ...cursor, string } };
  return withHint(followed, hasNotesLeft(result) ? transpositionHint(result, options) : undefined);
}
