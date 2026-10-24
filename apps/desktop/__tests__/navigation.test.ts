import { adjacentBeat, adjacentString, clampCursor, cursorInTrack, firstCursor } from '../src/lib/navigation';
import { QUARTER } from '@gp-editor/core';
import { beat, header, makeSong, note, withTrack } from '../test-support/songs';

const song = makeSong(
  [[beat(960, [note(1, 0)]), beat(1920, [note(2, 2)])], [], [beat(8640, [note(6, 3)])]],
  [header(1), header(2), header(3)],
);
const START = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };

describe('navigation', () => {
  it('finds the first beat of a track', () => {
    expect(firstCursor(song, 0)).toEqual({ ...START, string: 1 });
    expect(firstCursor(song, 5)).toBeUndefined();
    expect(firstCursor(makeSong([[]]), 0)).toBeUndefined();
  });

  it('steps through beats, skipping empty measures, and stops at the ends', () => {
    const second = adjacentBeat(song, START, 1);
    expect(second).toMatchObject({ measureIndex: 0, beatIndex: 1, string: 2 });
    const third = adjacentBeat(song, second, 1);
    expect(third).toMatchObject({ measureIndex: 2, beatIndex: 0 });
    expect(adjacentBeat(song, third, 1)).toBe(third);
    expect(adjacentBeat(song, third, -1)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(adjacentBeat(song, START, -1)).toBe(START);
  });

  it('moves between strings within the track', () => {
    expect(adjacentString(song, START, -1).string).toBe(1);
    expect(adjacentString(song, START, -5).string).toBe(1);
    expect(adjacentString(song, START, 9).string).toBe(6);
  });

  it('clamps a cursor into the song', () => {
    expect(clampCursor(song, { ...START, beatIndex: 9, string: 12 })).toMatchObject({ beatIndex: 1, string: 6 });
    expect(clampCursor(song, { ...START, measureIndex: 1 })).toEqual({ ...START, string: 1 });
  });
});

const HALF = { ...QUARTER, value: 2 as const };

describe('cursorInTrack', () => {
  // Track 1: two quarter notes in bar 1; track 2: a half note in bar 1 (from tick 960), then a quarter at 2880.
  const twoTracks = withTrack(song, [[beat(960, [note(1, 0)], HALF), beat(2880, [note(2, 0)])]], { strings: [43, 38, 33, 28].map((tuning, i) => ({ number: i + 1, tuning })) });

  it('puts the cursor on the beat of the other track sounding at the same moment', () => {
    // Arrange: the second quarter (tick 1920) sounds during the other track's half note
    const cursor = { ...START, beatIndex: 1 };

    // Act
    const moved = cursorInTrack(twoTracks, cursor, 1, 1);

    // Assert
    expect(moved).toEqual({ trackIndex: 1, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
  });

  it('keeps the string on the other track’s strings', () => {
    expect(cursorInTrack(twoTracks, START, 1, 6)?.string).toBe(4);
  });
});
