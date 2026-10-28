import type { Beat, Measure, Note, Song, Track, Voice } from '../model/song';
import type { BeatAddress, StringAddress } from './addresses';

/**
 * Path-copying helpers: each rebuilds only the objects on the path from the song down to the changed one and shares
 * every other branch. A change function that returns its input unchanged makes the helper return the same song.
 */

export function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

/** `items` with `item` inserted at `index`. */
export function insertAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/** True when both lists hold the same objects in the same order. */
export function hasSameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function updateTrack(song: Song, trackIndex: number, change: (track: Track) => Track): Song {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return song;
  }
  const next = change(track);
  return next === track ? song : { ...song, tracks: replaceAt(song.tracks, trackIndex, next) };
}

export function updateMeasure(song: Song, trackIndex: number, measureIndex: number, change: (measure: Measure) => Measure): Song {
  return updateTrack(song, trackIndex, (track) => {
    const measure = track.measures[measureIndex];
    if (measure === undefined) {
      return track;
    }
    const next = change(measure);
    return next === measure ? track : { ...track, measures: replaceAt(track.measures, measureIndex, next) };
  });
}

export function updateBeat(song: Song, at: BeatAddress, change: (beat: Beat) => Beat): Song {
  return updateMeasure(song, at.trackIndex, at.measureIndex, (measure) => {
    const beat = measure.beats[at.beatIndex];
    if (beat === undefined) {
      return measure;
    }
    const next = change(beat);
    return next === beat ? measure : { ...measure, beats: replaceAt(measure.beats, at.beatIndex, next) };
  });
}

/** Rebuilds only the path from the song down to one voice; every other branch is shared. */
export function updateVoice(song: Song, at: BeatAddress, change: (voice: Voice) => Voice): Song {
  return updateBeat(song, at, (beat) => {
    const voice = beat.voices[at.voiceIndex];
    if (voice === undefined) {
      return beat;
    }
    const next = change(voice);
    return next === voice ? beat : { ...beat, voices: replaceAt(beat.voices, at.voiceIndex, next) };
  });
}

/** Changes the note on the addressed string; the same song when there is none. */
export function updateNote(song: Song, at: StringAddress, change: (note: Note) => Note): Song {
  return updateVoice(song, at, (voice) => {
    const note = voice.notes.find((candidate) => candidate.string === at.string);
    if (note === undefined) {
      return voice;
    }
    const next = change(note);
    return next === note ? voice : { ...voice, notes: voice.notes.map((candidate) => (candidate === note ? next : candidate)) };
  });
}

/** Notes ordered by string, as readers produce them. */
export function sortByString(notes: readonly Note[]): readonly Note[] {
  return [...notes].sort((a, b) => a.string - b.string);
}
