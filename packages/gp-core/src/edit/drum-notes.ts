import type { Song } from '../model/song';
import { type StringAddress, findVoice, hasString } from './addresses';
import { MAX_DRUM_KEY, deleteNote, setNoteFret } from './edit-song';

/** The strings of a beat, the cursor's first, then those after it, wrapping round. */
function stringsFrom(first: number, count: number): readonly number[] {
  return Array.from({ length: count }, (_, i) => ((first - 1 + i) % count) + 1);
}

/**
 * A drum hit at the cursor (clicking a piece of the drum kit): on a percussion track a note's fret is its General MIDI
 * key. The drum goes on the cursor's string when that is free, else on the next free string, else it replaces the
 * cursor string's note; a drum the voice already plays is taken out instead. Same song for a pitched track, a missing
 * position or a key that is not a whole number 0–127.
 */
export function toggleDrumNote(song: Song, at: StringAddress, key: number): Song {
  const track = song.tracks[at.trackIndex];
  const voice = findVoice(song, at);
  if (track?.isPercussion !== true || voice === undefined || !hasString(song, at) || !Number.isInteger(key) || key < 0 || key > MAX_DRUM_KEY) {
    return song;
  }
  const playing = voice.notes.find((note) => note.fret === key);
  if (playing !== undefined) {
    return deleteNote(song, { ...at, string: playing.string });
  }
  const taken = new Set(voice.notes.map((note) => note.string));
  const string = stringsFrom(at.string, track.strings.length).find((candidate) => !taken.has(candidate)) ?? at.string;
  return setNoteFret(song, { ...at, string }, key);
}
