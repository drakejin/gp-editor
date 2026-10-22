import {
  type BeatAddress,
  type Duration,
  NORMAL_TUPLET,
  NOTE_VALUES,
  NO_STROKE,
  type NoteValue,
  type Song,
  type StringAddress,
  type StrokeDirection,
  type Tuplet,
  type Voice,
  deleteBeat,
  deleteBeatNotes,
  deleteMeasure,
  deleteNote,
  findNote,
  insertBeat,
  insertMeasure,
  setBeatDuration,
  setBeatPickStroke,
  setBeatStroke,
  setBeatText,
  tupletOf,
} from '@gp-editor/core';
import { type BarEdit, applyBarEdit } from './bar-edits';
import { type NoteEdit, applyNoteEdit } from './note-edits';

/** Duration edits of the cursor's beat (in the cursor's voice). */
type DurationEdit =
  | { readonly type: 'setNoteValue'; readonly value: NoteValue }
  | { readonly type: 'shiftNoteValue'; readonly step: -1 | 1 }
  | { readonly type: 'toggleDot' }
  | { readonly type: 'toggleTriplet' }
  /** `enters` notes in the time of … (tupletOf); 1 = none. */
  | { readonly type: 'setTuplet'; readonly enters: number };

/** Edits of the cursor's beat and voice. */
type BeatEdit =
  | { readonly type: 'insertBeat' }
  | { readonly type: 'deleteBeat' }
  /** The voice becomes a rest of the same length. */
  | { readonly type: 'makeRest' }
  | { readonly type: 'setStroke'; readonly direction: StrokeDirection }
  | { readonly type: 'setPickStroke'; readonly direction: StrokeDirection }
  | { readonly type: 'setBeatText'; readonly text: string };

/** Edits that act at the cursor; each returns the same song when it does not apply. */
export type SongEdit =
  | DurationEdit
  | BeatEdit
  | NoteEdit
  | BarEdit
  | { readonly type: 'insertMeasure' }
  | { readonly type: 'deleteMeasure' }
  /** ⌫ / ⌦: the note at the cursor becomes a rest; on a rest, the rest beat goes. */
  | { readonly type: 'erase' };

const TRIPLET: Tuplet = tupletOf(3) ?? NORMAL_TUPLET;
/** Stroke speed a new stroke gets: a sixteenth (TuxGuitar's stroke dialog default). */
const STROKE_VALUE = 16;

export function beatAddress(cursor: StringAddress): BeatAddress {
  const { trackIndex, measureIndex, beatIndex, voiceIndex } = cursor;
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

export function cursorVoice(
  song: Song,
  cursor: StringAddress,
): Voice | undefined {
  return song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[
    cursor.beatIndex
  ]?.voices[cursor.voiceIndex];
}

/** Applies one cursor edit to the song. */
export function applySongEdit(
  song: Song,
  cursor: StringAddress,
  edit: SongEdit,
): Song {
  switch (edit.type) {
    case 'setNoteValue':
    case 'shiftNoteValue':
    case 'toggleDot':
    case 'toggleTriplet':
    case 'setTuplet':
      return editDuration(song, cursor, edit);
    case 'insertBeat':
    case 'deleteBeat':
    case 'makeRest':
    case 'setStroke':
    case 'setPickStroke':
    case 'setBeatText':
      return editBeat(song, beatAddress(cursor), edit);
    case 'erase':
      return erase(song, cursor);
    case 'insertMeasure':
      return insertMeasure(song, cursor.measureIndex, 'after');
    case 'deleteMeasure':
      return deleteMeasure(song, cursor.measureIndex);
    case 'shiftTimeSignature':
    case 'shiftTempo':
    case 'shiftKeySignature':
    case 'toggleRepeatOpen':
    case 'toggleRepeatClose':
    case 'toggleAlternateEnding':
    case 'shiftRepeatCount':
    case 'setTripletFeel':
    case 'setSection':
      return applyBarEdit(song, cursor, edit);
    default:
      return applyNoteEdit(song, cursor, edit);
  }
}

/** The note at the cursor goes (its beat becomes a rest when it was the last); on a rest, the beat itself goes. */
function erase(song: Song, cursor: StringAddress): Song {
  if (findNote(song, cursor) !== undefined) {
    return deleteNote(song, cursor);
  }
  const voice = cursorVoice(song, cursor);
  return voice !== undefined && !voice.isEmpty && voice.notes.length === 0 ? deleteBeat(song, beatAddress(cursor)) : song;
}

function editBeat(song: Song, at: BeatAddress, edit: BeatEdit): Song {
  switch (edit.type) {
    case 'insertBeat':
      return insertBeat(song, at, 'after');
    case 'deleteBeat':
      return deleteBeat(song, at);
    case 'makeRest':
      return deleteBeatNotes(song, at);
    case 'setStroke':
      return setBeatStroke(
        song,
        at,
        edit.direction === 'none'
          ? NO_STROKE
          : { direction: edit.direction, value: STROKE_VALUE },
      );
    case 'setPickStroke':
      return setBeatPickStroke(song, at, edit.direction);
    case 'setBeatText':
      return setBeatText(song, at, edit.text);
  }
}

function editDuration(
  song: Song,
  cursor: StringAddress,
  edit: DurationEdit,
): Song {
  const current = cursorVoice(song, cursor)?.duration;
  if (current === undefined) {
    return song;
  }
  const next = nextDuration(current, edit);
  return next === undefined
    ? song
    : setBeatDuration(song, beatAddress(cursor), next);
}

function nextDuration(
  current: Duration,
  edit: DurationEdit,
): Duration | undefined {
  switch (edit.type) {
    case 'setNoteValue':
      return { ...current, value: edit.value };
    case 'shiftNoteValue': {
      const index = NOTE_VALUES.indexOf(current.value) + edit.step;
      const value = NOTE_VALUES[index];
      return value === undefined ? undefined : { ...current, value };
    }
    case 'toggleDot':
      return { ...current, dotted: !current.dotted, doubleDotted: false };
    case 'toggleTriplet':
      return {
        ...current,
        tuplet: isTriplet(current) ? NORMAL_TUPLET : TRIPLET,
      };
    case 'setTuplet': {
      const tuplet = tupletOf(edit.enters);
      return tuplet === undefined ? undefined : { ...current, tuplet };
    }
  }
}

export function isTriplet(duration: Duration): boolean {
  return (
    duration.tuplet.enters === TRIPLET.enters &&
    duration.tuplet.times === TRIPLET.times
  );
}
