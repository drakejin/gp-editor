import { describe, expect, it } from 'vitest';
import {
  CURVE_VALUE_RANGES,
  addCurvePoint,
  curveFromPoints,
  moveCurvePoint,
  normalizeCurvePoints,
  removeCurvePoint,
} from '../src/edit/curve-points';
import type { BendPoint } from '../src/model/song';

const WHAMMY = CURVE_VALUE_RANGES.tremoloBar;
const BEND = CURVE_VALUE_RANGES.bend;

function points(...pairs: readonly (readonly [number, number])[]): BendPoint[] {
  return pairs.map(([position, value]) => ({ position, value }));
}

/** [position, value] pairs, to compare curves at a glance. */
function pairs(curve: readonly BendPoint[]): (readonly [number, number])[] {
  return curve.map((point) => [point.position, point.value] as const);
}

const DIP = points([0, 0], [6, -4], [12, 0]);

describe('CURVE_VALUE_RANGES', () => {
  it('keeps a bend 0 to 3 tones up and the tremolo bar an octave either way, in quarter tones', () => {
    expect(CURVE_VALUE_RANGES).toEqual({ bend: { min: 0, max: 12 }, tremoloBar: { min: -24, max: 24 } });
  });
});

describe('normalizeCurvePoints', () => {
  it('rounds the points onto the 0…12 grid, clamps the values and sorts them by position', () => {
    // Act
    const normalized = normalizeCurvePoints(points([13, 40], [0.4, -30], [6, -2.6]), WHAMMY);

    // Assert
    expect(pairs(normalized)).toEqual([[0, -24], [6, -3], [12, 24]]);
  });

  it('keeps one point per position, the later one in the list', () => {
    // Act
    const normalized = normalizeCurvePoints(points([0, 0], [6, -4], [0, 2], [6.2, -6], [12, 0]), WHAMMY);

    // Assert
    expect(pairs(normalized)).toEqual([[0, 2], [6, -6], [12, 0]]);
  });

  it('leaves out points that are not numbers, and keeps a bend at or above its start', () => {
    // Act
    const whammy = normalizeCurvePoints(points([Number.NaN, 2], [3, Number.POSITIVE_INFINITY], [4, -1]), WHAMMY);
    const bend = normalizeCurvePoints(points([0, -3], [6, 20]), BEND);

    // Assert
    expect(pairs(whammy)).toEqual([[4, -1]]);
    expect(pairs(bend)).toEqual([[0, 0], [6, 12]]);
  });

  it('never writes negative zero', () => {
    expect(Object.is(normalizeCurvePoints(points([-0.2, -0.3]), WHAMMY)[0]?.value, 0)).toBe(true);
  });
});

describe('addCurvePoint', () => {
  it('puts a new point in position order, snapped to the grid', () => {
    // Arrange
    const frozen = Object.freeze(DIP);

    // Act
    const added = addCurvePoint(frozen, { position: 2.6, value: 1.2 }, WHAMMY);

    // Assert
    expect(pairs(added)).toEqual([[0, 0], [3, 1], [6, -4], [12, 0]]);
    expect(pairs(frozen)).toEqual([[0, 0], [6, -4], [12, 0]]);
  });

  it('replaces the point already at that position', () => {
    expect(pairs(addCurvePoint(DIP, { position: 6, value: -8 }, WHAMMY))).toEqual([[0, 0], [6, -8], [12, 0]]);
  });

  it('starts a curve from no points and clamps the value into the range', () => {
    expect(pairs(addCurvePoint([], { position: 4, value: 99 }, BEND))).toEqual([[4, 12]]);
  });
});

describe('moveCurvePoint', () => {
  it('moves a point to a new position and value on the grid', () => {
    // Act
    const moved = moveCurvePoint(DIP, 1, { position: 4.4, value: -9.6 }, WHAMMY);

    // Assert
    expect(pairs(moved)).toEqual([[0, 0], [4, -10], [12, 0]]);
  });

  it('keeps the point between its neighbours, so the order (and the point’s index) stays', () => {
    // Act
    const pastNext = moveCurvePoint(DIP, 1, { position: 12, value: -4 }, WHAMMY);
    const pastPrevious = moveCurvePoint(DIP, 1, { position: -3, value: -4 }, WHAMMY);
    const first = moveCurvePoint(DIP, 0, { position: 9, value: 2 }, WHAMMY);

    // Assert
    expect(pairs(pastNext)).toEqual([[0, 0], [11, -4], [12, 0]]);
    expect(pairs(pastPrevious)).toEqual([[0, 0], [1, -4], [12, 0]]);
    expect(pairs(first)).toEqual([[5, 2], [6, -4], [12, 0]]);
  });

  it('only changes the value of a point with no room between its neighbours', () => {
    expect(pairs(moveCurvePoint(points([0, 0], [1, 2], [2, 0]), 1, { position: 7, value: 5 }, WHAMMY))).toEqual([[0, 0], [1, 5], [2, 0]]);
  });

  it('clamps the value into the range and gives the same points for an index out of range', () => {
    expect(pairs(moveCurvePoint(DIP, 2, { position: 12, value: -40 }, WHAMMY))).toEqual([[0, 0], [6, -4], [12, -24]]);
    expect(moveCurvePoint(DIP, 3, { position: 1, value: 1 }, WHAMMY)).toBe(DIP);
    expect(moveCurvePoint(DIP, -1, { position: 1, value: 1 }, WHAMMY)).toBe(DIP);
  });

  it('gives the same points when the move lands where the point is', () => {
    expect(moveCurvePoint(DIP, 1, { position: 6.2, value: -3.8 }, WHAMMY)).toBe(DIP);
  });
});

describe('removeCurvePoint', () => {
  it('takes the point out and keeps the others', () => {
    // Arrange
    const frozen = Object.freeze(DIP);

    // Act
    const removed = removeCurvePoint(frozen, 1);

    // Assert
    expect(pairs(removed)).toEqual([[0, 0], [12, 0]]);
    expect(frozen).toHaveLength(3);
  });

  it('gives the same points for an index out of range', () => {
    expect(removeCurvePoint(DIP, 5)).toBe(DIP);
  });
});

describe('curveFromPoints', () => {
  it('makes a curve of the points, or none when there are no points', () => {
    expect(curveFromPoints(DIP)).toEqual({ points: DIP });
    expect(curveFromPoints([])).toBeUndefined();
  });
});
