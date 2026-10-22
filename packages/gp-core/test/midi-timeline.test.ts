import { describe, expect, it } from 'vitest';
import { positionAt, readSong, renderMidi, type TimelineEntry } from '../src/index';
import { loadFixture } from './helpers/fixtures';
import { makeSong } from './helpers/midi-song';

describe('renderMidi timeline', () => {
  it('has one entry per played measure of repeat-close.gp5, in playback order', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'repeat-close.gp5'));

    // Act
    const { timeline, durationSeconds } = renderMidi(song);

    // Assert
    expect(timeline.map((entry) => [entry.headerIndex, entry.tick, entry.seconds, entry.tempo])).toEqual([
      [0, 960, 0, 120],
      [1, 4800, 2, 120],
      [0, 960, 4, 120],
      [1, 4800, 6, 120],
      [2, 8640, 8, 120],
    ]);
    expect(durationSeconds).toBe(10);
  });

  it('counts each measure at its own tempo', () => {
    // Arrange
    const song = makeSong({
      headers: [{ tempo: 120 }, { tempo: 60 }, { tempo: 240, numerator: 2 }],
      tracks: [{ measures: [] }],
    });

    // Act
    const { timeline, durationSeconds } = renderMidi(song);

    // Assert
    expect(timeline.map((entry) => [entry.seconds, entry.tempo])).toEqual([
      [0, 120],
      [2, 60],
      [6, 240],
    ]);
    expect(durationSeconds).toBe(6.5);
  });

  it('starts at zero seconds at fromHeaderIndex', () => {
    // Arrange
    const song = makeSong({ headers: [{}, { tempo: 60 }, {}], tracks: [{ measures: [] }] });

    // Act
    const { timeline, durationSeconds } = renderMidi(song, { fromHeaderIndex: 1 });

    // Assert
    expect(timeline.map((entry) => [entry.headerIndex, entry.seconds])).toEqual([
      [1, 0],
      [2, 4],
    ]);
    expect(durationSeconds).toBe(6);
  });

  it('follows the MIDI tempo exactly for tempos that do not divide a minute evenly', () => {
    // Arrange
    const song = makeSong({ headers: [{ tempo: 90 }, { tempo: 90 }], tracks: [{ measures: [] }] });

    // Act
    const { timeline } = renderMidi(song);

    // Assert: the file says 666666 µs per quarter, four quarters per measure.
    expect(timeline[1]?.seconds).toBeCloseTo(2.666664, 9);
  });
});

describe('positionAt', () => {
  const song = readSong(loadFixture('guitarpro5', 'repeat-close.gp5'));
  const { timeline, durationSeconds } = renderMidi(song);

  it('finds the measure and the tick inside it for a time inside every played measure', () => {
    // Arrange
    const halfMeasure = 1;

    timeline.forEach((entry, index) => {
      // Act
      const position = positionAt(timeline, entry.seconds + halfMeasure);

      // Assert
      expect(position, `entry ${index}`).toEqual({ headerIndex: entry.headerIndex, tick: entry.tick + 1920 });
    });
  });

  it('returns the measure start exactly at a measure boundary', () => {
    // Act / Assert
    expect(positionAt(timeline, 2)).toEqual({ headerIndex: 1, tick: 4800 });
    expect(positionAt(timeline, 0)).toEqual({ headerIndex: 0, tick: 960 });
  });

  it('stays inside the measure just before its end', () => {
    // Act
    const position = positionAt(timeline, 2 - 1e-9);

    // Assert
    expect(position?.headerIndex).toBe(0);
    expect(position?.tick).toBeLessThan(4800);
    expect(position?.tick).toBeGreaterThanOrEqual(4799);
  });

  it('returns undefined before the start and past the end', () => {
    // Act / Assert
    expect(positionAt(timeline, -0.5)).toBeUndefined();
    expect(positionAt(timeline, durationSeconds)).toBeUndefined();
    expect(positionAt(timeline, durationSeconds + 3)).toBeUndefined();
    expect(positionAt(timeline, Number.NaN)).toBeUndefined();
    expect(positionAt(timeline, durationSeconds - 0.001)?.headerIndex).toBe(2);
  });

  it('returns undefined for an empty timeline', () => {
    // Act / Assert
    expect(positionAt([], 0)).toBeUndefined();
  });

  it('treats the last entry of a hand-made timeline without end as open-ended', () => {
    // Arrange
    const handMade: TimelineEntry[] = [{ seconds: 0, headerIndex: 3, tick: 960, tempo: 60 }];

    // Act / Assert
    expect(positionAt(handMade, 10)).toEqual({ headerIndex: 3, tick: 960 + 9600 });
  });
});
