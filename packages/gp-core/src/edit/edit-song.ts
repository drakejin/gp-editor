import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Beat, Measure, Note, Song, Track, Voice } from '../model/song';

/** Highest fret an edit may set (TuxGuitar's TGTrack.DEFAULT_MAX_FRET). */
export const MAX_FRET = 29;

/**
 * A string position in one voice of one beat — where the editor cursor sits. The position may hold no note yet:
 * setting a fret there adds one.
 */
export interface StringAddress {
  readonly trackIndex: number;
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
  /** 1 = highest string, as Note.string. */
  readonly string: number;
}

/** The note on the addressed string, if there is one. */
export function findNote(song: Song, at: StringAddress): Note | undefined {
  return findVoice(song, at)?.notes.find((note) => note.string === at.string);
}

/**
 * New song with the fret at the position set (clamped to 0…MAX_FRET); adds a note when the string is empty.
 * Same song when the position does not exist.
 */
export function setNoteFret(song: Song, at: StringAddress, fret: number): Song {
  const clamped = Math.min(MAX_FRET, Math.max(0, Math.round(fret)));
  const stringCount = song.tracks[at.trackIndex]?.strings.length ?? 0;
  if (at.string < 1 || at.string > stringCount) {
    return song;
  }
  return updateVoice(song, at, (voice) => {
    const existing = voice.notes.find((note) => note.string === at.string);
    if (existing?.fret === clamped) {
      return voice;
    }
    const note: Note = existing === undefined ? newNote(at.string, clamped) : { ...existing, fret: clamped };
    const others = voice.notes.filter((other) => other.string !== at.string);
    return { ...voice, isEmpty: false, notes: [...others, note].sort((a, b) => a.string - b.string) };
  });
}

/** New song with the note at the position moved to `string`. Same song if there is no note, or that string is missing or taken. */
export function setNoteString(song: Song, at: StringAddress, string: number): Song {
  const stringCount = song.tracks[at.trackIndex]?.strings.length ?? 0;
  if (string < 1 || string > stringCount || findNote(song, at) === undefined || findNote(song, { ...at, string }) !== undefined) {
    return song;
  }
  return updateVoice(song, at, (voice) => ({
    ...voice,
    notes: voice.notes.map((note) => (note.string === at.string ? { ...note, string } : note)).sort((a, b) => a.string - b.string),
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

function findVoice(song: Song, at: StringAddress): Voice | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex];
}

/** Rebuilds only the path from the song down to one voice; every other branch is shared. */
function updateVoice(song: Song, at: StringAddress, change: (voice: Voice) => Voice): Song {
  const track = song.tracks[at.trackIndex];
  const measure = track?.measures[at.measureIndex];
  const beat = measure?.beats[at.beatIndex];
  const voice = beat?.voices[at.voiceIndex];
  if (track === undefined || measure === undefined || beat === undefined || voice === undefined) {
    return song;
  }
  const nextVoice = change(voice);
  if (nextVoice === voice) {
    return song;
  }
  const nextBeat: Beat = { ...beat, voices: replaceAt(beat.voices, at.voiceIndex, nextVoice) };
  const nextMeasure: Measure = { ...measure, beats: replaceAt(measure.beats, at.beatIndex, nextBeat) };
  const nextTrack: Track = { ...track, measures: replaceAt(track.measures, at.measureIndex, nextMeasure) };
  return { ...song, tracks: replaceAt(song.tracks, at.trackIndex, nextTrack) };
}

function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}
