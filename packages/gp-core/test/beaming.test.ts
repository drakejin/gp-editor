import { describe, expect, it } from 'vitest';
import {
  MAX_BEAM_GROUPS,
  beamGroupBounds,
  defaultBeamGrouping,
  effectiveBeamGrouping,
  isSameBeamGrouping,
  normalizeBeamGrouping,
  parseBeamGrouping,
} from '../src/model/beaming';
import { measureTicks } from '../src/model/defaults';
import { QUARTER_TIME, type TimeSignature } from '../src/model/song';

const EIGHTH = QUARTER_TIME / 2;
const time = (numerator: number, denominator: number): TimeSignature => ({ numerator, denominator });

describe('defaultBeamGrouping', () => {
  it.each([
    [4, 4, 8, [2, 2, 2, 2]],
    [3, 4, 8, [2, 2, 2]],
    [2, 2, 8, [4, 4]],
    [6, 8, 8, [3, 3]],
    [12, 8, 8, [3, 3, 3, 3]],
    [3, 8, 8, [3]],
    [5, 8, 8, [2, 2, 1]],
    [7, 8, 8, [2, 2, 2, 1]],
    [7, 16, 16, [4, 3]],
    [6, 16, 16, [3, 3]],
    [2, 1, 8, [8, 8]],
  ])('beams %i/%i by the beat (or the dotted beat in compound time)', (numerator, denominator, unit, groups) => {
    // Act
    const grouping = defaultBeamGrouping(time(numerator, denominator));

    // Assert
    expect(grouping).toEqual({ unit, groups });
  });

  it('fills the whole bar', () => {
    // Arrange
    const signatures = [time(4, 4), time(7, 8), time(5, 4), time(9, 16), time(3, 2)];

    // Act
    const lengths = signatures.map((signature) => beamGroupBounds(defaultBeamGrouping(signature)).at(-1));

    // Assert
    expect(lengths).toEqual(signatures.map((signature) => measureTicks(signature.numerator, signature.denominator)));
  });
});

describe('beamGroupBounds', () => {
  it('lists where each group starts and where the last one ends, in ticks from the bar start', () => {
    // Act
    const bounds = beamGroupBounds({ unit: 8, groups: [3, 3, 2] });

    // Assert
    expect(bounds).toEqual([0, 3 * EIGHTH, 6 * EIGHTH, 8 * EIGHTH]);
  });
});

describe('isSameBeamGrouping', () => {
  it('compares the group boundaries, whatever unit counts them', () => {
    // Act / Assert
    expect(isSameBeamGrouping({ unit: 16, groups: [4, 4, 4, 4] }, { unit: 8, groups: [2, 2, 2, 2] })).toBe(true);
    expect(isSameBeamGrouping({ unit: 8, groups: [4, 4] }, { unit: 8, groups: [2, 2, 2, 2] })).toBe(false);
  });
});

describe('normalizeBeamGrouping', () => {
  it('drops a grouping that is the time signature’s own', () => {
    // Act / Assert
    expect(normalizeBeamGrouping({ unit: 8, groups: [2, 2, 2, 2] }, time(4, 4))).toBeUndefined();
    expect(normalizeBeamGrouping({ unit: 16, groups: [6, 6] }, time(6, 8))).toBeUndefined();
  });

  it('keeps another grouping as it is', () => {
    // Arrange
    const halves = { unit: 8, groups: [4, 4] } as const;

    // Act / Assert
    expect(normalizeBeamGrouping(halves, time(4, 4))).toEqual(halves);
    expect(normalizeBeamGrouping(undefined, time(4, 4))).toBeUndefined();
  });
});

describe('effectiveBeamGrouping', () => {
  it('is the bar’s own grouping, else the time signature’s', () => {
    // Arrange
    const halves = { unit: 8, groups: [4, 4] } as const;

    // Act / Assert
    expect(effectiveBeamGrouping({ timeSignature: time(4, 4), beamGrouping: halves })).toBe(halves);
    expect(effectiveBeamGrouping({ timeSignature: time(3, 4) })).toEqual({ unit: 8, groups: [2, 2, 2] });
  });
});

describe('parseBeamGrouping', () => {
  it('reads groups up to the first empty slot', () => {
    // Act
    const grouping = parseBeamGrouping(8, [2, 4, 2, 0, 0, 3]);

    // Assert
    expect(grouping).toEqual({ unit: 8, groups: [2, 4, 2] });
  });

  it('refuses an unknown unit, no groups, negative or fractional sizes', () => {
    // Act / Assert
    expect(parseBeamGrouping(3, [2, 2])).toBeUndefined();
    expect(parseBeamGrouping(8, [0, 2])).toBeUndefined();
    expect(parseBeamGrouping(8, [2, -1])).toEqual({ unit: 8, groups: [2] });
    expect(parseBeamGrouping(8, [1.5])).toBeUndefined();
    expect(parseBeamGrouping(8, [100000])).toBeUndefined();
  });

  it('keeps at most MAX_BEAM_GROUPS groups', () => {
    // Act
    const grouping = parseBeamGrouping(8, new Array<number>(MAX_BEAM_GROUPS + 5).fill(1));

    // Assert
    expect(grouping?.groups).toHaveLength(MAX_BEAM_GROUPS);
  });
});
