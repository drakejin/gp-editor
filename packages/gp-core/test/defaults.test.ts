import { describe, expect, it } from 'vitest';
import { NORMAL_TUPLET, isMeasureOverfull, tupletOf } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { buildSong, n, play, rest } from './helpers/edit-songs';

function firstMeasure(song: Song) {
  const header = song.measureHeaders[0];
  const measure = song.tracks[0]?.measures[0];
  if (header === undefined || measure === undefined) {
    throw new Error('test song has no first measure');
  }
  return { header, measure };
}

describe('isMeasureOverfull', () => {
  it('is false for a full and for an incomplete measure', () => {
    const full = firstMeasure(buildSong({ tracks: [[[[play(2, n(1, 0)), rest(2)]]]] }));
    const incomplete = firstMeasure(buildSong({ tracks: [[[[play(4, n(1, 0))]]]] }));
    expect(isMeasureOverfull(full.measure, full.header)).toBe(false);
    expect(isMeasureOverfull(incomplete.measure, incomplete.header)).toBe(false);
  });

  it('is true when any voice runs past the end of the measure', () => {
    // Arrange: 4/4 with five quarters in the second voice
    const song = buildSong({ tracks: [[[[play(1, n(1, 0))], [play(4, n(4, 0)), play(4, n(4, 1)), play(4, n(4, 2)), play(4, n(4, 3)), play(4, n(4, 4))]]]] });

    // Act
    const { header, measure } = firstMeasure(song);

    // Assert
    expect(isMeasureOverfull(measure, header)).toBe(true);
  });
});

describe('tupletOf', () => {
  it.each([
    [3, 2],
    [5, 4],
    [6, 4],
    [7, 4],
    [9, 8],
    [10, 8],
    [11, 8],
    [12, 8],
  ])('gives the tuplet of %i notes Guitar Pro stores: in the time of %i', (enters, times) => {
    // Act / Assert
    expect(tupletOf(enters)).toEqual({ enters, times });
  });

  it('gives no tuplet for one note', () => {
    expect(tupletOf(1)).toBe(NORMAL_TUPLET);
  });

  it.each([0, 2, 4, 8, 13, 2.5, -3, Number.NaN])('knows no tuplet of %d notes', (enters) => {
    expect(tupletOf(enters)).toBeUndefined();
  });
});
