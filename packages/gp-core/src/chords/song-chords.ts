// The chords a track uses, as Guitar Pro's "chords of the score" lists them.
import type { Chord, Song } from '../model/song';
import { isSameChord } from './shape';

/** The track's chords, each once (same name, first fret and frets), in the order they first appear. */
export function songChords(song: Song, trackIndex: number): readonly Chord[] {
  const chords = (song.tracks[trackIndex]?.measures ?? []).flatMap((measure) => measure.beats.flatMap((beat) => (beat.chord === undefined ? [] : [beat.chord])));
  return chords.filter((chord, index) => chords.findIndex((other) => isSameChord(chord, other)) === index);
}
