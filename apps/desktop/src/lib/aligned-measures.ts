import type { Song } from '@gp-editor/core';
import {
  type BeatLayout,
  type BeatRoom,
  type MeasureLayout,
  type RowLayout,
  beatWidths,
  breakRows,
  closeMeasure,
  justifyScale,
  layoutMeasure,
  measureFrame,
  stretchMeasure,
} from './layout';

/** The least distance between two moments of a multitrack bar, so beats starting apart never share an x. */
const MIN_COLUMN_GAP = 6;

const NO_ROOM: BeatRoom = () => 0;

/** One track's beats in the bar: their columns (moments shared with the other tracks) and widths. */
interface TrackBeats {
  readonly columns: readonly number[];
  readonly widths: readonly number[];
}

/** The bar's moments in order: a column per beat start (a start repeated on one track gets a column of its own). */
function columnKeys(song: Song, trackIndexes: readonly number[], measureIndex: number): readonly string[][] {
  return trackIndexes.map((trackIndex) => {
    const seen = new Map<number, number>();
    return (song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? []).map((beat) => {
      const repeat = seen.get(beat.start) ?? 0;
      seen.set(beat.start, repeat + 1);
      return `${beat.start}#${repeat}`;
    });
  });
}

function byMoment(a: string, b: string): number {
  const [startA = 0, repeatA = 0] = a.split('#').map(Number);
  const [startB = 0, repeatB = 0] = b.split('#').map(Number);
  return startA - startB || repeatA - repeatB;
}

/**
 * Each column's x (a beat's centre): after the column before it, and far enough from the previous beat of every track
 * with a beat there — half of each beat's room on either side, as layoutMeasure spaces one track.
 */
function columnCentres(tracks: readonly TrackBeats[], columnCount: number, beatsX: number): number[] {
  const starting = Array.from({ length: columnCount }, (): (readonly [TrackBeats, number])[] => []);
  tracks.forEach((track) => track.columns.forEach((column, beatIndex) => starting[column]?.push([track, beatIndex])));
  const centres: number[] = [];
  starting.forEach((beats, column) => {
    const after = column === 0 ? -Infinity : (centres[column - 1] ?? 0) + MIN_COLUMN_GAP;
    const needs = beats.map(([track, beatIndex]) => {
      const width = track.widths[beatIndex] ?? 0;
      const previous = track.columns[beatIndex - 1];
      return previous === undefined ? beatsX + width / 2 : (centres[previous] ?? 0) + ((track.widths[beatIndex - 1] ?? 0) + width) / 2;
    });
    centres.push(Math.max(after, ...needs));
  });
  return centres;
}

/**
 * One bar of several tracks laid out together (Guitar Pro's multitrack view): every track gets the same width — the
 * room the widest needs —, beats starting at the same moment share an x and each beat keeps at least its own room
 * from the next one of its track; the time signature stands behind the widest key change. One track is laid out as
 * layoutMeasure lays it out.
 */
export function layoutAlignedMeasures(song: Song, trackIndexes: readonly number[], measureIndex: number, beatRoom: BeatRoom = NO_ROOM): MeasureLayout[] {
  if (trackIndexes.length === 1) {
    return trackIndexes.map((trackIndex) => layoutMeasure(song, trackIndex, measureIndex, beatRoom));
  }
  const frames = trackIndexes.map((trackIndex) => measureFrame(song, trackIndex, measureIndex));
  const beatsX = Math.max(0, ...frames.map((frame) => frame.beatsX));
  const signatures = frames.flatMap((frame) => (frame.timeSignatureX === undefined ? [] : [frame.timeSignatureX]));
  const timeSignatureX = signatures.length === 0 ? undefined : Math.max(...signatures);
  const keys = columnKeys(song, trackIndexes, measureIndex);
  const order = [...new Set(keys.flat())].sort(byMoment);
  const columnOf = new Map(order.map((key, column) => [key, column]));
  const tracks = trackIndexes.map((trackIndex, i): TrackBeats => ({
    columns: (keys[i] ?? []).map((key) => columnOf.get(key) ?? 0),
    widths: beatWidths(song, trackIndex, measureIndex, beatRoom),
  }));
  const centres = columnCentres(tracks, order.length, beatsX);
  const ends = tracks.flatMap(({ columns, widths }) => {
    const last = columns.length - 1;
    return last < 0 ? [] : [(centres[columns[last] ?? 0] ?? 0) + (widths[last] ?? 0) / 2];
  });
  const beatsEnd = ends.length === 0 ? undefined : Math.max(...ends);
  return tracks.flatMap((track, i) => {
    const frame = frames[i];
    const beats = track.columns.map((column, beatIndex): BeatLayout => ({ beatIndex, x: centres[column] ?? 0 }));
    return frame === undefined ? [] : [closeMeasure(song, measureIndex, { ...frame, beatsX, timeSignatureX }, beats, beatsEnd)];
  });
}

/**
 * The rows of a multitrack score: the bars broken into rows once (they share their widths), every staff stretched
 * alike. `measures[i]` holds bar i's layout per staff; each row holds one RowLayout per staff.
 */
export function layoutAlignedRows(measures: readonly (readonly MeasureLayout[])[], availableWidth: number, firstRowWidth = availableWidth): RowLayout[][] {
  const staffCount = measures[0]?.length ?? 0;
  const reference = measures.flatMap((staves) => (staves[0] === undefined ? [] : [staves[0]]));
  const rows = breakRows(reference, availableWidth, firstRowWidth);
  let next = 0;
  return rows.map((row, rowIndex) => {
    const scale = justifyScale(row, rowIndex === 0 ? firstRowWidth : availableWidth, rowIndex === rows.length - 1);
    const bars = measures.slice(next, next + row.length);
    next += row.length;
    return Array.from({ length: staffCount }, (_, staff): RowLayout => ({
      measures: bars.flatMap((staves) => {
        const measure = staves[staff];
        return measure === undefined ? [] : [scale === undefined ? measure : stretchMeasure(measure, scale)];
      }),
    }));
  });
}
