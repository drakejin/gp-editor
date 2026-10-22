import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Note, Song } from '../model/song';
import { type StringAddress, findNote, hasString } from './addresses';
import { sortByString, updateVoice } from './song-paths';

export { type StringAddress, findNote } from './addresses';

/** Highest fret an edit may set (TuxGuitar's TGTrack.DEFAULT_MAX_FRET). */
export const MAX_FRET = 29;

/**
 * New song with the fret at the position set (clamped to 0…MAX_FRET); adds a note when the string is empty.
 * Same song when the position does not exist.
 */
export function setNoteFret(song: Song, at: StringAddress, fret: number): Song {
  const clamped = Math.min(MAX_FRET, Math.max(0, Math.round(fret)));
  if (!hasString(song, at)) {
    return song;
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

function newNote(string: number, fret: number): Note {
  return { string, fret, velocity: DEFAULT_VELOCITY, isTied: false, effect: EMPTY_NOTE_EFFECT };
}
