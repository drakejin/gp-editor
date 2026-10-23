import {
  type BeatAddress,
  type Chord,
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
  isSameTuplet,
  setBeatChord,
  setBeatChordNotes,
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
  | { readonly type: 'setTuplet'; readonly enters: number }
  /** A tuplet of `enters` notes inside the beat's tuplet (tupletOf); 1 = none. Only on a beat in a tuplet. */
  | { readonly type: 'setInnerTuplet'; readonly enters: number }
  | { readonly type: 'toggleInnerTriplet' };

/** Edits of the cursor's beat and voice. */
type BeatEdit =
  | { readonly type: 'insertBeat' }
  | { readonly type: 'deleteBeat' }
  /** The voice becomes a rest of the same length. */
  | { readonly type: 'makeRest' }
  | { readonly type: 'setStroke'; readonly direction: StrokeDirection }
  | { readonly type: 'setPickStroke'; readonly direction: StrokeDirection }
  | { readonly type: 'setBeatText'; readonly text: string }
  /** The beat's chord diagram (undefined removes it); `withNotes` also writes its notes into the voice, as Guitar Pro can. */
  | { readonly type: 'setBeatChord'; readonly chord: Chord | undefined; readonly withNotes?: boolean };

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
    case 'setInnerTuplet':
    case 'toggleInnerTriplet':
      return editDuration(song, cursor, edit);
    case 'insertBeat':
    case 'deleteBeat':
    case 'makeRest':
    case 'setStroke':
    case 'setPickStroke':
    case 'setBeatText':
    case 'setBeatChord':
      return editBeat(song, beatAddress(cursor), edit);
    case 'erase':
      return erase(song, cursor);
    case 'insertMeasure':
      return insertMeasure(song, cursor.measureIndex, 'after');
    case 'deleteMeasure':
      return deleteMeasure(song, cursor.measureIndex);
    case 'shiftTimeSignature':
    case 'shiftTempo':
    case 'setTempo':
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
    case 'setBeatChord': {
      const chorded = setBeatChord(song, at, edit.chord);
      return edit.withNotes === true && edit.chord !== undefined ? setBeatChordNotes(chorded, at, edit.chord) : chorded;
    }
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
      return withTuplet(current, isTriplet(current) ? NORMAL_TUPLET : TRIPLET);
    case 'setTuplet': {
      const tuplet = tupletOf(edit.enters);
      return tuplet === undefined ? undefined : withTuplet(current, tuplet);
    }
    case 'setInnerTuplet': {
      const inner = tupletOf(edit.enters);
      return inner === undefined || !isInTuplet(current) ? undefined : withInnerTuplet(current, inner);
    }
    case 'toggleInnerTriplet':
      return isInTuplet(current) ? withInnerTuplet(current, isInnerTriplet(current) ? NORMAL_TUPLET : TRIPLET) : undefined;
  }
}

/** True when the beat is in a tuplet (so a tuplet may go inside it). */
export function isInTuplet(duration: Duration): boolean {
  return duration.tuplet.enters !== duration.tuplet.times;
}

function isInnerTriplet(duration: Duration): boolean {
  return duration.innerTuplet !== undefined && isSameTuplet(duration.innerTuplet, TRIPLET);
}

/** The duration in `tuplet`; a tuplet inside the old one stays inside the new one, and goes when there is none. */
function withTuplet(duration: Duration, tuplet: Tuplet): Duration {
  const { value, dotted, doubleDotted, innerTuplet } = duration;
  const isKept = innerTuplet !== undefined && tuplet.enters !== tuplet.times;
  return { value, dotted, doubleDotted, tuplet, ...(isKept ? { innerTuplet } : {}) };
}

/** The duration with `inner` inside its tuplet (none for the normal 1:1). */
function withInnerTuplet(duration: Duration, inner: Tuplet): Duration {
  const { value, dotted, doubleDotted, tuplet } = duration;
  return { value, dotted, doubleDotted, tuplet, ...(inner.enters === inner.times ? {} : { innerTuplet: inner }) };
}

export function isTriplet(duration: Duration): boolean {
  return (
    duration.tuplet.enters === TRIPLET.enters &&
    duration.tuplet.times === TRIPLET.times
  );
}
