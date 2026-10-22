import { DEFAULT_VELOCITY, clampVelocity } from '../formats/common/velocity';
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Note, Song } from '../model/song';
import { type StringAddress, findNote, findVoice, hasString } from './addresses';
import { sortByString, updateNote, updateVoice } from './song-paths';
import { fillEmptyVoice } from './voice-entry';

export { type StringAddress, findNote } from './addresses';

/** Highest fret an edit may set (TuxGuitar's TGTrack.DEFAULT_MAX_FRET). */
export const MAX_FRET = 29;

/** True for a whole fret from 0 to MAX_FRET. */
export function isFret(fret: number): boolean {
  return Number.isInteger(fret) && fret >= 0 && fret <= MAX_FRET;
}

/** Frets of the neck the app draws, and that tunings are fitted to (a 24-fret guitar or bass). */
export const NECK_FRETS = 24;

/**
 * New song with the fret at the position set (clamped to 0…MAX_FRET); adds a note when the string is empty. In an
 * empty voice (the second voice where it has no event yet) the note lasts as long as the beat and the voice is filled
 * with rests up to the bar lines (fillEmptyVoice). Same song when the position does not exist or the fret is not a number.
 */
export function setNoteFret(song: Song, at: StringAddress, fret: number): Song {
  const clamped = Math.min(MAX_FRET, Math.max(0, Math.round(fret)));
  if (!hasString(song, at) || !Number.isFinite(fret)) {
    return song;
  }
  if (findVoice(song, at)?.isEmpty === true) {
    return fillEmptyVoice(song, at, newNote(at.string, clamped));
  }
  return updateVoice(song, at, (voice) => {
    const existing = voice.notes.find((note) => note.string === at.string);
    if (existing?.fret === clamped) {
      return voice;
    }
    const note: Note = existing === undefined ? newNote(at.string, clamped) : { ...existing, fret: clamped };
    const others = voice.notes.filter((other) => other.string !== at.string);
    return { ...voice, isEmpty: false, notes: sortByString([...others, note]) };
  });
}

/** New song with the note at the position moved to `string`. Same song if there is no note, or that string is missing or taken. */
export function setNoteString(song: Song, at: StringAddress, string: number): Song {
  const target: StringAddress = { ...at, string };
  if (!hasString(song, target) || findNote(song, at) === undefined || findNote(song, target) !== undefined) {
    return song;
  }
  return updateVoice(song, at, (voice) => ({
    ...voice,
    notes: sortByString(voice.notes.map((note) => (note.string === at.string ? { ...note, string } : note))),
  }));
}

/** New song without the note at the position. A voice whose last note is removed becomes a rest. */
export function deleteNote(song: Song, at: StringAddress): Song {
  if (findNote(song, at) === undefined) {
    return song;
  }
  return updateVoice(song, at, (voice) => ({ ...voice, notes: voice.notes.filter((note) => note.string !== at.string) }));
}

/**
 * New song with the velocity of the note at the position set, rounded and kept between ppp and fff
 * (MIN_VELOCITY…MAX_VELOCITY; see DYNAMICS). Same song when it is the same, not a number, or there is no note.
 */
export function setNoteVelocity(song: Song, at: StringAddress, velocity: number): Song {
  if (!Number.isFinite(velocity)) {
    return song;
  }
  const next = clampVelocity(velocity);
  return updateNote(song, at, (note) => (note.velocity === next ? note : { ...note, velocity: next }));
}

function newNote(string: number, fret: number): Note {
  return { string, fret, velocity: DEFAULT_VELOCITY, isTied: false, effect: EMPTY_NOTE_EFFECT };
}
