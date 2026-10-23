import { describe, expect, it } from 'vitest';
import { splitPreciseDuration, splitPreciseDurationApproximately } from '../src/formats/midi/duration-split';
import {
  PRECISE_PER_TICK,
  WHOLE_PRECISE_DURATION,
  durationFromPrecise,
  preciseTimeOf,
  toPreciseTime,
} from '../src/formats/midi/precise-duration';
import { NORMAL_TUPLET } from '../src/model/defaults';
import type { Duration, NoteValue } from '../src/model/song';

const W = WHOLE_PRECISE_DURATION;
const TRIPLET = { enters: 3, times: 2 };

function plain(value: NoteValue, dotted = false): Duration {
  return { value, dotted, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

function triplet(value: NoteValue): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet: TRIPLET };
}

/** MidiSettings' defaults: nothing shorter than a sixteenth, no tuplets. */
const DEFAULTS = { maxDurationValue: 16, maxDivision: 1 } as const;
const WITH_TRIPLETS = { maxDurationValue: 16, maxDivision: 3 } as const;

function sixteenths(count: number): number {
  return Math.round((W / 16) * count);
}

describe('precise durations (TGDuration)', () => {
  it('uses TuxGuitar unit: a whole is divisible by every tuplet and the dots', () => {
    // Assert
    expect(W).toBe(11531520);
    expect(PRECISE_PER_TICK).toBe(3003);
    expect(toPreciseTime(960)).toBe(W / 4);
  });

  it('measures plain, dotted and tuplet durations exactly', () => {
    // Assert
    expect(preciseTimeOf(plain(4))).toBe(W / 4);
    expect(preciseTimeOf(plain(4, true))).toBe((W * 3) / 8);
    expect(preciseTimeOf({ ...plain(4), doubleDotted: true })).toBe((W * 7) / 16);
    expect(preciseTimeOf(triplet(8))).toBe(W / 12);
  });

  it('maps a precise time back to the first duration TuxGuitar lists for it', () => {
    // Assert
    expect(durationFromPrecise(W / 4)).toEqual(plain(4));
    expect(durationFromPrecise((W * 3) / 8)).toEqual(plain(4, true));
    expect(durationFromPrecise(W / 12)).toEqual(triplet(8));
    expect(durationFromPrecise(1)).toBeUndefined();
  });
});

describe('splitPreciseDuration', () => {
  it('fills a time with equal durations, tuplets first', () => {
    // Act
    const quarters = splitPreciseDuration((W * 3) / 4, W);
    const mixed = splitPreciseDuration(W / 2 + W / 12, W, WITH_TRIPLETS);

    // Assert
    expect(quarters).toEqual([plain(4), plain(4), plain(4)]);
    expect(mixed).toEqual([triplet(8), plain(2)]);
  });

  it('returns nothing for zero and undefined for a time no duration list can fill', () => {
    // Assert
    expect(splitPreciseDuration(0, W)).toEqual([]);
    expect(splitPreciseDuration(1, W)).toBeUndefined();
    expect(splitPreciseDuration(W / 12, W, DEFAULTS)).toBeUndefined();
  });

  it('writes a dotted duration only when plain ones cannot fill the time, and only without a limit', () => {
    // Act
    const sixtyFourths = splitPreciseDuration((W * 3) / 64, W);
    const dotted = splitPreciseDuration((W * 3) / 128, W);

    // Assert
    expect(sixtyFourths).toEqual([plain(64), plain(64), plain(64)]);
    expect(dotted).toEqual([plain(64, true)]);
  });
});

describe('splitPreciseDurationApproximately (MIDI import quantisation)', () => {
  it('keeps a time that is already a plain duration', () => {
    // Assert
    expect(splitPreciseDurationApproximately(W / 4, W, DEFAULTS)).toEqual([plain(4)]);
  });

  it('drops a time shorter than half the shortest duration, rounds a longer one up to it', () => {
    // Assert
    expect(splitPreciseDurationApproximately(sixteenths(0.4), W, DEFAULTS)).toEqual([]);
    expect(splitPreciseDurationApproximately(sixteenths(0.6), W, DEFAULTS)).toEqual([plain(16)]);
  });

  it('prefers a plain duration within a sixteenth, the shorter one on a tie', () => {
    // Assert: three sixteenths are as close to an eighth as to a quarter; the dotted eighth is more complex.
    expect(splitPreciseDurationApproximately(sixteenths(3), W, DEFAULTS)).toEqual([plain(8)]);
    expect(splitPreciseDurationApproximately(sixteenths(7), W, DEFAULTS)).toEqual([plain(4, true)]);
  });

  it('takes a dotted duration when no plain one is close enough', () => {
    // Assert
    expect(splitPreciseDurationApproximately(sixteenths(6), W, DEFAULTS)).toEqual([plain(4, true)]);
  });

  it('combines durations, longest first, when no single one fits', () => {
    // Assert
    expect(splitPreciseDurationApproximately(sixteenths(10), W, DEFAULTS)).toEqual([plain(2), plain(8)]);
  });

  it('keeps triplets when the settings allow them, and rounds them to the sixteenth grid when not', () => {
    // Assert
    expect(splitPreciseDurationApproximately(W / 12, W, WITH_TRIPLETS)).toEqual([triplet(8)]);
    expect(splitPreciseDurationApproximately(W / 12, W, DEFAULTS)).toEqual([plain(16)]);
  });

  it('prefers one division for the whole time over an exact split that mixes divisions', () => {
    // Act
    const durations = splitPreciseDurationApproximately(W / 2 + W / 12, W, WITH_TRIPLETS);

    // Assert
    expect(durations).toEqual([triplet(2), triplet(4), triplet(8)]);
  });

  it('combines durations no longer than the measure', () => {
    // Act: twenty sixteenths in 2/4 measures.
    const durations = splitPreciseDurationApproximately(sixteenths(20), W / 2, DEFAULTS);

    // Assert
    expect(durations).toEqual([plain(2), plain(2), plain(4)]);
  });

  it('returns nothing for a time of zero or less', () => {
    // Assert
    expect(splitPreciseDurationApproximately(0, W, DEFAULTS)).toEqual([]);
    expect(splitPreciseDurationApproximately(-sixteenths(1), W, DEFAULTS)).toEqual([]);
  });
});
