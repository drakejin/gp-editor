import { describe, expect, it } from 'vitest';
import { bendFromCurve, tremoloBarFromCurve } from '../src/formats/gpif/gpif-note';
import type { Bend, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { bendCurveOf, canGpifHoldCurve, toGpifCurve, whammyCurveOf } from '../src/write/gpif/gpif-curves';
import { listFixtures, loadFixture } from './helpers/fixtures';

const points = (...pairs: readonly (readonly [number, number])[]): Bend => ({
  points: pairs.map(([position, value]) => ({ position, value })),
});

function curves(song: Song, kind: 'bend' | 'tremoloBar'): Bend[] {
  return song.tracks.flatMap((track) =>
    track.measures.flatMap((measure) =>
      measure.beats.flatMap((beat) =>
        beat.voices.flatMap((voice) => voice.notes.flatMap((note) => (note.effect[kind] === undefined ? [] : [note.effect[kind]]))),
      ),
    ),
  );
}

const ALL_FOLDERS = ['guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6', 'guitarpro7', 'guitarpro8'] as const;
const GPIF_FOLDERS = ['guitarpro6', 'guitarpro7', 'guitarpro8'] as const;
/** Reading every fixture of a folder takes a few seconds under coverage. */
const SWEEP_TIMEOUT = 60000;
/** GP6 writes the whammy as properties that may leave values out; GP7+ writes the <Whammy> element with all of them. */
const WHAMMY_ELEMENT_FOLDERS = ['guitarpro7', 'guitarpro8'] as const;

describe('bendCurveOf', () => {
  it.each(GPIF_FOLDERS)('gives back every bend the GPIF reader returns for the %s fixtures', (folder) => {
    // Arrange
    const bends = listFixtures(folder).flatMap((name) => curves(readSong(loadFixture(folder, name)), 'bend'));

    // Act
    const misses = bends.filter((bend) => JSON.stringify(bendFromCurve(bendCurveOf(bend))) !== JSON.stringify(bend));

    // Assert
    expect(bends.length).toBeGreaterThan(0);
    expect(misses).toEqual([]);
  }, SWEEP_TIMEOUT);

  it.each([
    ['bend', points([0, 0], [6, 4], [12, 4])],
    ['bend and release', points([0, 0], [3, 4], [6, 4], [9, 0], [12, 0])],
    ['pre-bend', points([0, 4], [12, 4])],
    ['pre-bend and release', points([0, 4], [4, 4], [8, 0], [12, 0])],
    ['a quarter-tone bend', points([0, 0], [12, 1])],
  ])('writes the TuxGuitar %s preset exactly', (_name, bend) => {
    // Arrange / Act
    const read = bendFromCurve(bendCurveOf(bend));

    // Assert
    expect(read).toEqual(bend);
  });

  it('writes the GP-style curve properties: origin, middle and destination in 1/100 tones and percent', () => {
    // Arrange / Act
    const curve = bendCurveOf(points([0, 0], [3, 4], [6, 4], [9, 0], [12, 0]));

    // Assert
    expect(curve).toEqual({
      originValue: 0,
      originOffset: undefined,
      middleValue: 100,
      middleOffset1: 25,
      middleOffset2: 50,
      destinationValue: 0,
      destinationOffset: 75,
    });
  });

  it('keeps the start, the extreme and the end of a curve GPIF cannot hold', () => {
    // Arrange: bend, release, bend again (seven points)
    const bend = points([0, 0], [2, 4], [4, 4], [6, 0], [8, 0], [10, 4], [12, 4]);

    // Act
    const read = bendFromCurve(bendCurveOf(bend));

    // Assert
    expect(read).toEqual(points([0, 0], [2, 4], [10, 4], [12, 4]));
  });

  it('starts a curve at position 0 and ends it at 12', () => {
    // Arrange / Act
    const read = bendFromCurve(bendCurveOf(points([3, 2])));

    // Assert
    expect(read).toEqual(points([0, 2], [12, 2]));
  });
});

describe('whammyCurveOf', () => {
  it.each(WHAMMY_ELEMENT_FOLDERS)('gives back every tremolo bar the GPIF reader returns for the %s fixtures', (folder) => {
    // Arrange
    const bars = listFixtures(folder).flatMap((name) => curves(readSong(loadFixture(folder, name)), 'tremoloBar'));

    // Act
    const misses = bars.filter((bar) => JSON.stringify(tremoloBarFromCurve(whammyCurveOf(bar))) !== JSON.stringify(bar));

    // Assert
    expect(bars.length).toBeGreaterThan(0);
    expect(misses).toEqual([]);
  }, SWEEP_TIMEOUT);

  it('writes every value of the <Whammy> element (the reader takes a missing attribute as 0)', () => {
    // Arrange / Act
    const curve = whammyCurveOf(points([0, 0], [0, 0], [6, -4], [12, 0]));

    // Assert
    expect(curve).toEqual({
      originValue: 0,
      originOffset: 0,
      middleValue: -100,
      middleOffset1: 50,
      middleOffset2: 50,
      destinationValue: 0,
      destinationOffset: 100,
    });
  });

  it.each([
    ['dip', points([0, 0], [0, 0], [6, -4], [12, 0])],
    ['dive in two steps', points([0, 0], [0, 0], [3, -4], [9, -4], [11, -8], [12, -8])],
  ])('writes a %s as Guitar Pro 7 does exactly', (_name, bar) => {
    // Arrange / Act
    const read = tremoloBarFromCurve(whammyCurveOf(bar));

    // Assert
    expect(read).toEqual(bar);
  });

  it.each([
    ['dive', points([0, 0], [12, -8]), points([0, 0], [0, 0], [12, -8], [12, -8])],
    ['dip', points([0, 0], [6, -4], [12, 0]), points([0, 0], [0, 0], [6, -4], [12, 0])],
    ['release up', points([0, -8], [12, 0]), points([0, -8], [0, -8], [12, 0], [12, 0])],
    ['dive, hold, release', points([0, 0], [3, -8], [9, -8], [12, 0]), points([0, 0], [0, 0], [3, -8], [9, -8], [12, 0])],
  ])('reads a GP3–GP5 %s back with its start twice and its middle', (_name, bar, expected) => {
    // Arrange / Act
    const read = tremoloBarFromCurve(whammyCurveOf(bar));

    // Assert
    expect(read).toEqual(expected);
  });

  it('clamps values to one octave either way', () => {
    // Arrange / Act
    const read = tremoloBarFromCurve(whammyCurveOf(points([0, 0], [0, 0], [6, -40], [12, -40])));

    // Assert
    expect(read).toEqual(points([0, 0], [0, 0], [6, -24], [12, -24]));
  });

  it('keeps the start, the extreme and the end of a curve GPIF cannot hold', () => {
    // Arrange
    const bar = points([0, 0], [2, -4], [4, 0], [6, -8], [8, 0], [12, 0]);

    // Act
    const read = tremoloBarFromCurve(whammyCurveOf(bar));

    // Assert
    expect(read).toEqual(points([0, 0], [0, 0], [6, -8], [12, 0]));
  });
});

describe('curve sweep over every fixture', () => {
  it.each(ALL_FOLDERS)('writes every bend and tremolo bar of the %s fixtures as a curve the reader accepts', (folder) => {
    // Arrange
    const songs = listFixtures(folder).map((name) => readSong(loadFixture(folder, name)));

    // Act
    const unreadable = songs.flatMap((song) => [
      ...curves(song, 'bend').filter((bend) => bendFromCurve(bendCurveOf(bend)) === undefined),
      ...curves(song, 'tremoloBar').filter((bar) => tremoloBarFromCurve(whammyCurveOf(bar)) === undefined),
    ]);

    // Assert
    expect(unreadable).toEqual([]);
  }, SWEEP_TIMEOUT);
});

describe('toGpifCurve and canGpifHoldCurve', () => {
  it('gives the curve a .gp file reads back, as the writer and the reader make it', () => {
    // Arrange
    const bar = points([0, 0], [3, -4], [6, 2], [9, -2], [12, 0]);

    // Act
    const kept = toGpifCurve('tremoloBar', bar);

    // Assert
    expect(kept).toEqual(tremoloBarFromCurve(whammyCurveOf(bar)));
    expect(toGpifCurve('bend', points([0, 0], [6, 4], [12, 4]))).toEqual(points([0, 0], [6, 4], [12, 4]));
  });

  it.each([
    ['the tremolo bar presets’ shapes (read back with their start twice)', 'tremoloBar', points([0, 0], [6, -4], [12, 0])],
    ['a hand-made dive, hold and rise', 'tremoloBar', points([0, 0], [3, 0], [6, -6], [9, -6], [12, 2])],
    ['a bend and release', 'bend', points([0, 0], [3, 4], [6, 4], [9, 0], [12, 0])],
  ] as const)('holds %s', (_name, effect, curve) => {
    expect(canGpifHoldCurve(effect, curve)).toBe(true);
  });

  it.each([
    ['a tremolo bar with two dips', 'tremoloBar', points([0, 0], [3, -4], [6, 2], [9, -2], [12, 0])],
    ['a curve that does not start at 0', 'tremoloBar', points([3, 0], [9, -4], [12, -4])],
    ['a bend with three heights', 'bend', points([0, 0], [3, 2], [6, 4], [9, 6], [12, 6])],
  ] as const)('cannot hold %s', (_name, effect, curve) => {
    expect(canGpifHoldCurve(effect, curve)).toBe(false);
  });
});
