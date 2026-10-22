import { adjacentBeat, adjacentString, clampCursor, firstCursor } from '../src/lib/navigation';
import { beat, header, makeSong, note } from '../test-support/songs';

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
