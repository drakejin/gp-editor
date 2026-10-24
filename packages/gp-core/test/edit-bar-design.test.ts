import { describe, expect, it } from 'vitest';
import { clearBarDesign, hasBarDesign, setBarWidthScale, setBeatOffset, setSystemBars } from '../src/edit/bar-design';
import { deleteMeasure, insertMeasure } from '../src/edit/measures';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function threeBars(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(2, n(1, 5)), play(2, n(1, 7))]], [[play(1, n(2, 3))]], [[play(1, n(3, 2))]]]] }));
}

describe('setBeatOffset', () => {
  it('moves the beats starting at a place of the bar, and leaves the other bars as they were', () => {
    // Arrange
    const song = threeBars();

    // Act
    const edited = setBeatOffset(song, 0, 960, 12.34);

    // Assert
    expect(edited.measureHeaders[0]?.design).toEqual({ beatOffsets: [{ at: 960, offset: 12.3 }] });
    expect(edited.measureHeaders[1]).toBe(song.measureHeaders[1]);
    expect(edited.tracks).toBe(song.tracks);
  });

  it('keeps the offsets in start order, one per place, and clamps them', () => {
    // Arrange
    const once = setBeatOffset(threeBars(), 0, 960, 4);

    // Act
    const edited = setBeatOffset(setBeatOffset(once, 0, 0, -900), 0, 960, 8);

    // Assert
    expect(edited.measureHeaders[0]?.design?.beatOffsets).toEqual([{ at: 0, offset: -200 }, { at: 960, offset: 8 }]);
  });

  it('takes the bar back to no design when the last offset goes to 0', () => {
    const moved = setBeatOffset(threeBars(), 1, 0, 5);
    expect(setBeatOffset(moved, 1, 0, 0).measureHeaders[1]).not.toHaveProperty('design');
  });

  it('returns the same song for a bar it does not have or a change to nothing', () => {
    const song = threeBars();
    expect(setBeatOffset(song, 7, 0, 5)).toBe(song);
    expect(setBeatOffset(song, 0, 0, 0)).toBe(song);
    expect(setBeatOffset(song, 0, -5, 3)).toBe(song);
  });
});

describe('setBarWidthScale', () => {
  it('sets the bar width, rounded and clamped; 1 removes it', () => {
    const song = threeBars();
    expect(setBarWidthScale(song, 2, 1.234).measureHeaders[2]?.design).toEqual({ widthScale: 1.23 });
    expect(setBarWidthScale(song, 2, 0.01).measureHeaders[2]?.design).toEqual({ widthScale: 0.25 });
    expect(setBarWidthScale(setBarWidthScale(song, 2, 2), 2, 1).measureHeaders[2]).not.toHaveProperty('design');
  });
});

describe('setSystemBars', () => {
  it('starts a system at the bar with that many bars, or as many as fit (0); undefined takes it away', () => {
    const song = threeBars();
    expect(setSystemBars(song, 1, 2).measureHeaders[1]?.design).toEqual({ systemBars: 2 });
    expect(setSystemBars(song, 1, 0).measureHeaders[1]?.design).toEqual({ systemBars: 0 });
    expect(setSystemBars(song, 1, 99).measureHeaders[1]?.design).toEqual({ systemBars: 64 });
    expect(setSystemBars(setSystemBars(song, 1, 2), 1, undefined).measureHeaders[1]).not.toHaveProperty('design');
  });
});

describe('clearBarDesign / hasBarDesign', () => {
  it('takes the design off the bars named, or off every bar', () => {
    // Arrange
    const designed = setSystemBars(setBarWidthScale(setBeatOffset(threeBars(), 0, 0, 3), 1, 2), 2, 1);

    // Act
    const some = clearBarDesign(designed, [0, 1]);
    const all = clearBarDesign(designed);

    // Assert
    expect(hasBarDesign(designed)).toBe(true);
    expect(some.measureHeaders[0]).not.toHaveProperty('design');
    expect(some.measureHeaders[1]).not.toHaveProperty('design');
    expect(some.measureHeaders[2]).toBe(designed.measureHeaders[2]);
    expect(hasBarDesign(all)).toBe(false);
    expect(clearBarDesign(threeBars())).toEqual(threeBars());
  });

  it('returns the same song when no bar has a design', () => {
    const song = threeBars();
    expect(clearBarDesign(song)).toBe(song);
  });
});

describe('a bar keeps its design when bars are inserted or deleted before it', () => {
  it('follows its bar', () => {
    // Arrange
    const designed = setBarWidthScale(threeBars(), 2, 1.5);

    // Act
    const inserted = insertMeasure(designed, 0, 'before');
    const deleted = deleteMeasure(designed, 0);

    // Assert
    expect(inserted.measureHeaders[3]?.design).toEqual({ widthScale: 1.5 });
    expect(inserted.measureHeaders[0]?.design).toBeUndefined();
    expect(deleted.measureHeaders[1]?.design).toEqual({ widthScale: 1.5 });
  });
});
