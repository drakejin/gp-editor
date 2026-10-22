import { measureTicks } from '../model/defaults';
import { type Measure, type MeasureHeader, QUARTER_TIME, type Song, type Track } from '../model/song';
import { hasSameItems } from './song-paths';

/** Length of a header's measure in ticks. */
export function headerTicks(header: MeasureHeader): number {
  return measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
}

function moveMeasure(measure: Measure, headerIndex: number, delta: number): Measure {
  if (delta === 0 && measure.headerIndex === headerIndex) {
    return measure;
  }
  const beats = delta === 0 ? measure.beats : measure.beats.map((beat) => ({ ...beat, start: beat.start + delta }));
  return { ...measure, headerIndex, beats };
}

function relayoutTrack(track: Track, measures: readonly Measure[], deltas: readonly number[]): Track {
  const moved = measures.map((measure, index) => moveMeasure(measure, index, deltas[index] ?? 0));
  return hasSameItems(moved, track.measures) ? track : { ...track, measures: moved };
}

/**
 * Song with new measure headers and per-track measures (moveMeasureHeaders + moveMeasureComponents): headers are
 * renumbered 1…n and laid end to end from the song's first start, and each measure's beats move with its header.
 * `headers[i].start` must be the start that measure i's beats are currently laid out against. Unchanged headers,
 * measures and tracks are kept.
 */
export function relayoutMeasures(song: Song, headers: readonly MeasureHeader[], measuresByTrack: readonly (readonly Measure[])[]): Song {
  let start = song.measureHeaders[0]?.start ?? QUARTER_TIME;
  const deltas: number[] = [];
  const placed = headers.map((header, index) => {
    const next = header.number === index + 1 && header.start === start ? header : { ...header, number: index + 1, start };
    deltas.push(start - header.start);
    start += headerTicks(header);
    return next;
  });
  const tracks = song.tracks.map((track, trackIndex) => relayoutTrack(track, measuresByTrack[trackIndex] ?? [], deltas));
  return {
    ...song,
    measureHeaders: hasSameItems(placed, song.measureHeaders) ? song.measureHeaders : placed,
    tracks: hasSameItems(tracks, song.tracks) ? song.tracks : tracks,
  };
}
