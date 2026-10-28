// Ties after TuxGuitar's TGChangeTiedNoteAction and TGTrackManager.getPreviousNoteForTie (LGPL-2.1).
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Beat, Note, NoteEffect, Song, Voice } from '../model/song';
import { type StringAddress, hasString } from './addresses';
import { sortByString, updateNote, updateVoice } from './song-paths';

/** The last event of a voice among `beats`, before `beforeIndex`. */
function lastEventBefore(beats: readonly Beat[], beforeIndex: number, voiceIndex: number): Voice | undefined {
  for (let i = Math.min(beforeIndex, beats.length) - 1; i >= 0; i--) {
    const voice = beats[i]?.voices[voiceIndex];
    if (voice !== undefined && !voice.isEmpty) {
      return voice;
    }
  }
  return undefined;
}

/**
 * The note a tie at the address continues: the note on that string in the previous event of the same voice (in this
 * measure, else the last event of the previous measure). None when that event is a rest or has no note on the string.
 */
export function previousNoteForTie(song: Song, at: StringAddress): Note | undefined {
  const measures = song.tracks[at.trackIndex]?.measures;
  const beats = measures?.[at.measureIndex]?.beats;
  if (measures === undefined || beats?.[at.beatIndex] === undefined) {
    return undefined;
  }
  const inMeasure = lastEventBefore(beats, at.beatIndex, at.voiceIndex);
  const previousBeats = measures[at.measureIndex - 1]?.beats ?? [];
  const previous = inMeasure ?? lastEventBefore(previousBeats, previousBeats.length, at.voiceIndex);
  return previous?.notes.find((note) => note.string === at.string);
}

/**
 * The song with each tied note at `addresses` untied when its tie has nothing left to continue (previousNoteForTie):
 * what an edit that removed or moved the notes before them leaves (Move Voice, deleting a run's notes).
 */
export function untieOrphanNotes(song: Song, addresses: readonly StringAddress[]): Song {
  return addresses.reduce(
    (current, address) => (previousNoteForTie(current, address) === undefined ? updateNote(current, address, (note) => (note.isTied ? { ...note, isTied: false } : note)) : current),
    song,
  );
}

/** The note tied to `previous`: its fret, no dead note, and its harmonic when it has one. */
function tiedTo(note: Note, previous: Note): Note {
  const harmonic = previous.effect.harmonic ?? note.effect.harmonic;
  const effect: NoteEffect = { ...note.effect, deadNote: false, ...(harmonic === undefined ? {} : { harmonic }) };
  return { ...note, fret: previous.fret, isTied: true, effect };
}

function isSameTie(note: Note, tied: Note): boolean {
  const harmonic = note.effect.harmonic;
  const tiedHarmonic = tied.effect.harmonic;
  const isSameHarmonic = harmonic?.type === tiedHarmonic?.type && harmonic?.data === tiedHarmonic?.data;
  return note.isTied && note.fret === tied.fret && !note.effect.deadNote && isSameHarmonic;
}

function tieInVoice(voice: Voice, string: number, previous: Note): Voice {
  const existing = voice.notes.find((note) => note.string === string);
  const base: Note = existing ?? { string, fret: previous.fret, velocity: previous.velocity, isTied: true, effect: EMPTY_NOTE_EFFECT };
  const tied = tiedTo(base, previous);
  if (existing !== undefined && isSameTie(existing, tied)) {
    return voice;
  }
  const others = voice.notes.filter((note) => note !== existing);
  return { ...voice, notes: sortByString([...others, tied]) };
}

/**
 * New song with the note at the address tied (it takes the fret of the previous note on its string) or untied.
 * Tying an empty string of a played beat or rest adds a tied note. Same song when nothing changes, the voice is empty
 * there, or there is no previous note on that string to tie to.
 */
export function setNoteTied(song: Song, at: StringAddress, isTied: boolean): Song {
  if (!isTied) {
    return updateNote(song, at, (note) => (note.isTied ? { ...note, isTied: false } : note));
  }
  const previous = hasString(song, at) ? previousNoteForTie(song, at) : undefined;
  if (previous === undefined) {
    return song;
  }
  return updateVoice(song, at, (voice) => (voice.isEmpty ? voice : tieInVoice(voice, at.string, previous)));
}
