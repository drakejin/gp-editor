import { adjacentBeat, adjacentString, clampCursor, cursorInTrack, firstCursor, voiceCursor } from '../src/lib/navigation';
import { type Beat, type Duration, type Note, type Voice, QUARTER } from '@gp-editor/core';
import { beat, fromTux, header, makeSong, note, withTrack } from '../test-support/songs';

const song = makeSong(
  [[beat(960, [note(1, 0)]), beat(1920, [note(2, 2)])], [], [beat(8640, [note(6, 3)])]],
  [header(1), header(2), header(3)],
);
const START = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };

describe('navigation', () => {
  it('starts on the track’s first bar, also when the track rests there (a bar without beats)', () => {
    expect(firstCursor(song, 0)).toEqual({ ...START, string: 1 });
    expect(firstCursor(song, 5)).toBeUndefined();
    expect(firstCursor(makeSong([[], [beat(4800, [note(1, 0)])]]), 0)).toEqual({ ...START, string: 1 });
  });

  it('steps through beats, stopping once in a bar without beats, and stops at the ends', () => {
    // Arrange
    const second = { ...START, beatIndex: 1 };

    // Act
    const empty = adjacentBeat(song, second, 1);
    const third = adjacentBeat(song, empty, 1);

    // Assert
    expect(adjacentBeat(song, START, 1)).toMatchObject({ measureIndex: 0, beatIndex: 1, string: 2 });
    expect(empty).toEqual({ ...START, measureIndex: 1, beatIndex: 0 });
    expect(third).toMatchObject({ measureIndex: 2, beatIndex: 0 });
    expect(adjacentBeat(song, third, 1)).toBe(third);
    expect(adjacentBeat(song, third, -1)).toEqual(empty);
    expect(adjacentBeat(song, empty, -1)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(adjacentBeat(song, START, -1)).toBe(START);
  });

  it('moves between strings within the track', () => {
    expect(adjacentString(song, START, -1).string).toBe(1);
    expect(adjacentString(song, START, -5).string).toBe(1);
    expect(adjacentString(song, START, 9).string).toBe(6);
  });

  it('clamps a cursor into the song, keeping it in a bar without beats on that bar’s beat 0', () => {
    expect(clampCursor(song, { ...START, beatIndex: 9, string: 12 })).toMatchObject({ beatIndex: 1, string: 6 });
    expect(clampCursor(song, { ...START, measureIndex: 1, beatIndex: 3 })).toEqual({ ...START, measureIndex: 1, beatIndex: 0 });
    expect(clampCursor(song, { ...START, measureIndex: 9 })).toEqual({ ...START, measureIndex: 2 });
    expect(clampCursor(song, { ...START, measureIndex: -1 })).toEqual(START);
    expect(clampCursor(song, { ...START, trackIndex: 4 })).toBeUndefined();
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

  it('goes into a bar where the other track rests, and out of one, at that bar', () => {
    const resting = { ...START, measureIndex: 1 };
    expect(cursorInTrack(twoTracks, { ...START, trackIndex: 1, measureIndex: 1 }, 0, 2)).toEqual(resting);
    expect(cursorInTrack(twoTracks, resting, 1, 1)).toEqual({ ...START, trackIndex: 1, measureIndex: 1, string: 1 });
  });
});

const EIGHTH: Duration = { ...QUARTER, value: 8 };
const NO_EVENT: Voice = { duration: QUARTER, notes: [], isEmpty: true, direction: 'none' };

function played(duration: Duration, notes: Note[] = []): Voice {
  return { duration, notes, isEmpty: false, direction: 'none' };
}

/** A beat at `start` TuxGuitar ticks with voices 1 and 4 (2 and 3 empty). */
function voicesBeat(start: number, first: Voice, fourth: Voice): Beat {
  return { ...beat(start, []), start: fromTux(start), voices: [first, NO_EVENT, NO_EVENT, fourth] };
}

describe('the cursor in one voice of several', () => {
  // Bar 1: voice 1 a quarter, then (at 1920) another; voice 4 an eighth rest, an eighth at 1440, nothing after.
  // Bar 2: one quarter in voice 1.
  const voices = makeSong([
    [
      voicesBeat(960, played(QUARTER, [note(1, 5)]), played(EIGHTH)),
      voicesBeat(1440, NO_EVENT, played(EIGHTH, [note(4, 7)])),
      voicesBeat(1920, played(QUARTER, [note(1, 7)]), NO_EVENT),
    ],
    [beat(4800, [note(2, 3)])],
  ]);
  const voice1 = { ...START, voiceIndex: 0 };

  it('steps over the beats where another voice plays inside the edited voice’s note', () => {
    expect(adjacentBeat(voices, voice1, 1)).toMatchObject({ measureIndex: 0, beatIndex: 2 });
    expect(adjacentBeat(voices, { ...voice1, beatIndex: 2 }, -1)).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('stops on every beat of the voice it edits', () => {
    const voice4 = { ...START, voiceIndex: 3 };
    expect(adjacentBeat(voices, voice4, 1)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
  });

  it('stops where the edited voice has nothing to sound, so a typed note can go there', () => {
    const voice2 = { ...START, voiceIndex: 1 };
    expect(adjacentBeat(voices, voice2, 1)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(adjacentBeat(voices, { ...START, voiceIndex: 3, beatIndex: 1 }, 1)).toMatchObject({ measureIndex: 0, beatIndex: 2 });
  });

  it('comes back from the next bar onto the edited voice’s last beat of the bar', () => {
    // Arrange: voice 1 holds a half note over the eighth of voice 4
    const held = makeSong([
      [voicesBeat(960, played(HALF, [note(1, 5)]), played(EIGHTH)), voicesBeat(1440, NO_EVENT, played(EIGHTH, [note(4, 7)]))],
      [beat(4800, [note(2, 3)])],
    ]);

    // Act
    const back = adjacentBeat(held, { ...voice1, measureIndex: 1 }, -1);

    // Assert
    expect(back).toMatchObject({ measureIndex: 0, beatIndex: 0 });
  });

  it('puts a cursor that stands inside its voice’s note on the beat where that note starts', () => {
    expect(voiceCursor(voices, { ...voice1, beatIndex: 1 })).toMatchObject({ beatIndex: 0, voiceIndex: 0 });
    expect(voiceCursor(voices, { ...voice1, beatIndex: 2 })).toMatchObject({ beatIndex: 2 });
    expect(voiceCursor(voices, { ...START, voiceIndex: 1, beatIndex: 1 })).toMatchObject({ beatIndex: 1 });
  });
});
