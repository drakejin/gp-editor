// Ties after TuxGuitar's TGChangeTiedNoteAction and TGTrackManager.getPreviousNoteForTie (LGPL-2.1).
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Beat, Note, NoteEffect, Song, Voice } from '../model/song';
import { type BeatAddress, type StringAddress, hasString } from './addresses';
import { sortByString, updateNote, updateVoice } from './song-paths';

/** Index of the last event of a voice among `beats`, before `beforeIndex`; −1 when there is none. */
function lastEventIndexBefore(beats: readonly Beat[], beforeIndex: number, voiceIndex: number): number {
  for (let i = Math.min(beforeIndex, beats.length) - 1; i >= 0; i--) {
    if (beats[i]?.voices[voiceIndex]?.isEmpty === false) {
      return i;
    }
  }
  return -1;
}

function noteAt(song: Song, at: StringAddress): Note | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex]?.notes.find((note) => note.string === at.string);
}

/** Where the note a tie at the address continues is (previousNoteForTie's note); undefined when there is none. */
function previousTieAddress(song: Song, at: StringAddress): StringAddress | undefined {
  const measures = song.tracks[at.trackIndex]?.measures ?? [];
  const inBar = lastEventIndexBefore(measures[at.measureIndex]?.beats ?? [], at.beatIndex, at.voiceIndex);
  const previousBeats = measures[at.measureIndex - 1]?.beats ?? [];
  const inPreviousBar = lastEventIndexBefore(previousBeats, previousBeats.length, at.voiceIndex);
  const address = inBar >= 0 ? { ...at, beatIndex: inBar } : inPreviousBar >= 0 ? { ...at, measureIndex: at.measureIndex - 1, beatIndex: inPreviousBar } : undefined;
  return address !== undefined && noteAt(song, address) !== undefined ? address : undefined;
}

/**
 * The note a tie at the address continues: the note on that string in the previous event of the same voice (in this
 * measure, else the last event of the previous measure). None when that event is a rest or has no note on the string.
 */
export function previousNoteForTie(song: Song, at: StringAddress): Note | undefined {
  const address = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex] === undefined ? undefined : previousTieAddress(song, at);
  return address === undefined ? undefined : noteAt(song, address);
}

/** The first note of the tied chain the note at `at` is in: back through the notes its ties continue (`at` itself when untied). */
export function tieChainStart(song: Song, at: StringAddress): StringAddress {
  let current = at;
  while (noteAt(song, current)?.isTied === true) {
    const previous = previousTieAddress(song, current);
    if (previous === undefined) {
      return current;
    }
    current = previous;
  }
  return current;
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

/** The voice's first event after `last`: later in its bar, else in the next bar (where a tie looks back from); undefined when none. */
export function nextVoiceEvent(song: Song, last: BeatAddress): BeatAddress | undefined {
  const measures = song.tracks[last.trackIndex]?.measures ?? [];
  const isEvent = (beat: Beat): boolean => beat.voices[last.voiceIndex]?.isEmpty === false;
  const inBar = measures[last.measureIndex]?.beats.findIndex((beat, beatIndex) => beatIndex > last.beatIndex && isEvent(beat)) ?? -1;
  if (inBar >= 0) {
    return { ...last, beatIndex: inBar };
  }
  const inNextBar = measures[last.measureIndex + 1]?.beats.findIndex(isEvent) ?? -1;
  return inNextBar < 0 ? undefined : { ...last, measureIndex: last.measureIndex + 1, beatIndex: inNextBar };
}

/** The tied notes on `strings` of the event at `at` (none when there is no event). */
export function tiedNotesAt(song: Song, at: BeatAddress | undefined, strings: ReadonlySet<number>): readonly StringAddress[] {
  const voice = at === undefined ? undefined : song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex];
  const notes = voice?.notes.filter((note) => note.isTied && strings.has(note.string)) ?? [];
  return at === undefined ? [] : notes.map((note) => ({ ...at, string: note.string }));
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
