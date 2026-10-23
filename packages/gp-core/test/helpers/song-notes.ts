import { durationTicks } from '../../src/model/defaults';
import type { Measure, Note, Song, Track } from '../../src/model/song';

/** Sounding pitch of a note: the open string plus the capo and the fret, or the fret itself on a percussion track. */
export function pitchOf(track: Track, note: Note): number {
  return track.isPercussion ? note.fret : (track.strings[note.string - 1]?.tuning ?? 0) + track.offset + note.fret;
}

/** One beat of the first voice: start relative to its measure, length in ticks, and its notes' pitches (ascending). */
export interface BeatSummary {
  readonly at: number;
  readonly ticks: number;
  readonly pitches: readonly number[];
}

export function beatsOf(song: Song, trackIndex: number, measureIndex: number): BeatSummary[] {
  const track = song.tracks[trackIndex];
  const measure: Measure | undefined = track?.measures[measureIndex];
  const start = song.measureHeaders[measureIndex]?.start ?? 0;
  if (track === undefined || measure === undefined) {
    return [];
  }
  return measure.beats.flatMap((beat) => {
    const voice = beat.voices[0];
    if (voice === undefined || voice.isEmpty) {
      return [];
    }
    const pitches = voice.notes.map((note) => pitchOf(track, note)).sort((a, b) => a - b);
    return [{ at: beat.start - start, ticks: durationTicks(voice.duration), pitches }];
  });
}

/** Every note of a track that is struck (not tied), as [song tick, pitch], in order. */
export function struckNotes(song: Song, trackIndex: number): [number, number][] {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return [];
  }
  return track.measures.flatMap((measure) =>
    measure.beats.flatMap((beat) =>
      beat.voices.flatMap((voice) =>
        voice.notes.filter((note) => !note.isTied).map((note): [number, number] => [beat.start, pitchOf(track, note)]),
      ),
    ),
  );
}
