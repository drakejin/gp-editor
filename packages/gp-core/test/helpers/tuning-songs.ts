import type { Song, Track } from '../../src/model/song';
import { type EventSpec, buildSong } from './edit-songs';

export interface TrackOptions {
  /** GM program of the track's channel (25 = steel guitar when left out). */
  readonly program?: number;
  /** Capo fret. */
  readonly offset?: number;
  readonly isPercussion?: boolean;
}

/** One track on `tuning` (string 1 first); `measures` → voices → events, as buildSong. */
export function songOnStrings(tuning: readonly number[], measures: readonly (readonly (readonly EventSpec[])[])[], options: TrackOptions = {}): Song {
  const song = buildSong({ tracks: [measures] });
  const track = song.tracks[0] as Track;
  const strings = tuning.map((open, index) => ({ number: index + 1, tuning: open }));
  const tuned: Track = { ...track, strings, offset: options.offset ?? 0, isPercussion: options.isPercussion ?? false };
  const channels = song.channels.map((channel) => ({ ...channel, program: options.program ?? channel.program }));
  return { ...song, channels, tracks: [tuned] };
}

/** Sounding pitches (open string + fret + capo) of every beat, sorted: one `measure:beat:p1,p2` entry per beat. */
export function beatPitches(song: Song, trackIndex = 0): string[] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  return track.measures.flatMap((measure, measureIndex) =>
    measure.beats.map((beat, beatIndex) => {
      const pitches = beat.voices
        .flatMap((voice) => voice.notes)
        .map((note) => (track.strings[note.string - 1]?.tuning ?? Number.NaN) + note.fret + track.offset)
        .sort((a, b) => a - b);
      return `${measureIndex}:${beatIndex}:${pitches.join(',')}`;
    }),
  );
}
