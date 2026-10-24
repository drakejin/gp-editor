import { QUARTER, readSong } from '@gp-editor/core';
import { layoutAlignedMeasures, layoutAlignedRows } from '../src/lib/aligned-measures';
import { TAB, layoutMeasure, layoutRows } from '../src/lib/layout';
import { readFixture } from '../test-support/fixtures';
import { beat, header, makeSong, note, withTrack } from '../test-support/songs';

const EIGHTH = { ...QUARTER, value: 8 as const };
const WHOLE = { ...QUARTER, value: 1 as const };

/** Bar 1: track 1 four quarters, track 2 a whole note, track 3 eight eighths. */
function threeTracks() {
  const quarters = makeSong([[960, 1920, 2880, 3840].map((start) => beat(start, [note(1, 0)]))]);
  const whole = withTrack(quarters, [[beat(960, [note(2, 0)], WHOLE)]]);
  return withTrack(whole, [Array.from({ length: 8 }, (_, i) => beat(960 + i * 480, [note(3, 0)], EIGHTH))]);
}

describe('layoutAlignedMeasures', () => {
  it('lays out one track exactly as layoutMeasure does', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro5', 'canon.gp5'));

    // Act
    const aligned = song.measureHeaders.map((_, i) => layoutAlignedMeasures(song, [2], i)[0]);

    // Assert
    expect(aligned).toEqual(song.measureHeaders.map((_, i) => layoutMeasure(song, 2, i)));
  });

  it('gives every track the same bar width, at least the widest track’s own', () => {
    // Arrange
    const song = threeTracks();

    // Act
    const layouts = layoutAlignedMeasures(song, [0, 1, 2], 0);

    // Assert
    const widths = layouts.map((layout) => layout.width);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeGreaterThanOrEqual(Math.max(...[0, 1, 2].map((t) => layoutMeasure(song, t, 0).width)));
  });

  it('puts beats that start together under one another', () => {
    // Act
    const [quarters, whole, eighths] = layoutAlignedMeasures(threeTracks(), [0, 1, 2], 0);

    // Assert: quarter n starts with eighth 2n, the whole note with the first of each
    expect(quarters!.beats.map((b) => b.x)).toEqual([0, 2, 4, 6].map((i) => eighths!.beats[i]!.x));
    expect(whole!.beats[0]!.x).toBe(quarters!.beats[0]!.x);
  });

  it('keeps each beat at least its own room from the next one of its track', () => {
    // Act
    const [quarters, , eighths] = layoutAlignedMeasures(threeTracks(), [0, 1, 2], 0);
    const gaps = (xs: readonly number[]) => xs.slice(1).map((x, i) => x - xs[i]!);
    const single = layoutMeasure(threeTracks(), 2, 0);

    // Assert
    expect(Math.min(...gaps(eighths!.beats.map((b) => b.x)))).toBeGreaterThanOrEqual(Math.min(...gaps(single.beats.map((b) => b.x))));
    expect(Math.min(...gaps(quarters!.beats.map((b) => b.x)))).toBeGreaterThan(0);
  });

  it('lines up the time signature behind the widest key change and keeps each track’s own key', () => {
    // Arrange: bar 2 changes key on track 2 only
    const base = makeSong([[beat(960, [note(1, 0)])], [beat(4800, [note(1, 0)])]], [header(1), header(2, { timeSignature: { numerator: 3, denominator: 4 } })]);
    const keyed = withTrack(base, [[beat(960, [note(1, 0)])], [beat(4800, [note(1, 0)])]]);
    const song = { ...keyed, tracks: keyed.tracks.map((track, t) => (t === 1 ? { ...track, measures: track.measures.map((m, i) => (i === 1 ? { ...m, keySignature: 3 } : m)) } : track)) };

    // Act
    const [plain, changed] = layoutAlignedMeasures(song, [0, 1], 1);

    // Assert
    expect(plain!.keySignatureX).toBeUndefined();
    expect(changed!.keySignatureX).toBe(TAB.padLeft);
    expect(plain!.timeSignatureX).toBe(changed!.timeSignatureX);
    expect(plain!.beats[0]!.x).toBe(changed!.beats[0]!.x);
  });

  it('gives a bar empty on every track the empty bar width', () => {
    const song = withTrack(makeSong([[]]), [[]]);
    expect(layoutAlignedMeasures(song, [0, 1], 0).map((m) => m.width)).toEqual([layoutMeasure(song, 0, 0).width, layoutMeasure(song, 0, 0).width]);
  });
});

describe('layoutAlignedRows', () => {
  it('breaks the bars into rows once, every track sharing the rows and the stretched widths', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro5', 'nightwish.gp5'));
    const trackIndexes = song.tracks.map((_, t) => t);
    const measures = song.measureHeaders.map((_, i) => layoutAlignedMeasures(song, trackIndexes, i));

    // Act
    const rows = layoutAlignedRows(measures, 900, 800);

    // Assert
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row) => {
      expect(row).toHaveLength(trackIndexes.length);
      const widths = row.map((staff) => staff.measures.map((m) => m.width));
      widths.forEach((w) => expect(w).toEqual(widths[0]));
      expect(row.every((staff) => staff.measures.every((m, i) => m.measureIndex === row[0]!.measures[i]!.measureIndex))).toBe(true);
    });
    const firstWidth = rows[0]![0]!.measures.reduce((sum, m) => sum + m.width, 0);
    expect(firstWidth).toBeLessThanOrEqual(800 + 1e-6);
  });

  it('breaks one track’s bars as layoutRows does when the first row is as wide as the others', () => {
    // Arrange
    const song = readSong(readFixture('guitarpro5', 'canon.gp5'));
    const measures = song.measureHeaders.map((_, i) => layoutAlignedMeasures(song, [0], i));

    // Act
    const rows = layoutAlignedRows(measures, 900, 900);

    // Assert
    expect(rows.map((row) => row[0])).toEqual(layoutRows(measures.map((m) => m[0]!), 900));
  });
});
