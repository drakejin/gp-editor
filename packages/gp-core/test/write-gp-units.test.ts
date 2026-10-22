import { describe, expect, it } from 'vitest';
import { bendPositionFromGp, bendValueFromGp, tremoloBarValueFromGp } from '../src/formats/common/bend-units';
import { velocityFromGp } from '../src/formats/common/velocity';
import { NORMAL_TUPLET } from '../src/model/defaults';
import {
  bendPositionToGp,
  bendValueToGp,
  channelValueToGp,
  durationValueToGp,
  dynamicFromVelocity,
  graceTransitionToGp,
  strokeSpeedToGp,
  tremoloPickingSpeedToGp,
  trillPeriodToGp,
  tupletDivisionToGp,
} from '../src/write/gp-units';

/** GP3–GP5 readers: channel byte to MIDI value (shared.ts toChannelValue). */
const channelValueFromGp = (value: number): number => Math.max(value * 8 - 1, 0);

describe('gp-units: inverses of the readers conversions', () => {
  it('bend positions 0…12 become 0…60 and read back exactly', () => {
    // Arrange
    const positions = Array.from({ length: 13 }, (_, i) => i);

    // Act
    const raw = positions.map(bendPositionToGp);

    // Assert
    expect(raw).toEqual(positions.map((position) => position * 5));
    expect(raw.map((value) => bendPositionFromGp(value, 60))).toEqual(positions);
  });

  it('bend and tremolo bar values in quarter tones become 1/100 tones (×25) and read back exactly', () => {
    // Arrange
    const values = [-24, -8, -1, 0, 1, 2, 4, 6, 8, 12, 24];

    // Act
    const raw = values.map(bendValueToGp);

    // Assert
    expect(raw).toEqual(values.map((value) => value * 25));
    expect(raw.map(bendValueFromGp)).toEqual(values);
    expect(raw.map(tremoloBarValueFromGp)).toEqual(values);
  });

  it('velocities become dynamics that read back to the same velocity (ppp … fff, and 0)', () => {
    // Arrange
    const velocities = [0, 15, 31, 47, 63, 79, 95, 111, 127];

    // Act
    const dynamics = velocities.map(dynamicFromVelocity);

    // Assert
    expect(dynamics).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(dynamics.map(velocityFromGp)).toEqual(velocities);
  });

  it('other velocities take the nearest dynamic', () => {
    expect([100, 64, 1, 127].map(dynamicFromVelocity)).toEqual([6, 4, 0, 8]);
  });

  it('channel values become GP bytes 0…16 that read back exactly when they came from a GP file', () => {
    // Arrange
    const values = Array.from({ length: 17 }, (_, i) => Math.max(i * 8 - 1, 0));

    // Act
    const bytes = values.map(channelValueToGp);

    // Assert
    expect(bytes).toEqual(Array.from({ length: 17 }, (_, i) => i));
    expect(bytes.map(channelValueFromGp)).toEqual(values);
  });

  it('other channel values take the nearest step and stay in range', () => {
    expect([100, 64, -5, 300].map(channelValueToGp)).toEqual([13, 8, 0, 16]);
  });

  it('note values become the signed duration byte (-2 = whole … 4 = 64th)', () => {
    expect(([1, 2, 4, 8, 16, 32, 64] as const).map(durationValueToGp)).toEqual([-2, -1, 0, 1, 2, 3, 4]);
  });

  it('writes the tuplets Guitar Pro has and drops the others', () => {
    expect(tupletDivisionToGp({ enters: 3, times: 2 }, true)).toBe(3);
    expect(tupletDivisionToGp({ enters: 6, times: 4 }, true)).toBe(6);
    expect(tupletDivisionToGp({ enters: 13, times: 8 }, true)).toBe(13);
    expect(tupletDivisionToGp({ enters: 13, times: 8 }, false)).toBeUndefined();
    expect(tupletDivisionToGp({ enters: 3, times: 4 }, true)).toBeUndefined();
    expect(tupletDivisionToGp(NORMAL_TUPLET, true)).toBeUndefined();
  });

  it('stroke speeds become TuxGuitar stroke bytes (nearest for values Guitar Pro lacks)', () => {
    expect([64, 32, 16, 8, 4, 128, 2].map(strokeSpeedToGp)).toEqual([2, 3, 4, 5, 6, 2, 6]);
  });

  it('trill and tremolo picking speeds become their bytes (nearest for values Guitar Pro lacks)', () => {
    expect([16, 32, 64, 8, 4].map(trillPeriodToGp)).toEqual([1, 2, 3, 1, 1]);
    expect([8, 16, 32, 4, 64].map(tremoloPickingSpeedToGp)).toEqual([1, 2, 3, 1, 3]);
  });

  it('grace transitions become their index', () => {
    expect((['none', 'slide', 'bend', 'hammer'] as const).map(graceTransitionToGp)).toEqual([0, 1, 2, 3]);
  });
});
