import { effectParamSpec } from '@gp-editor/core';
import { formatEffectValue, paramFromPosition, positionOfParam, stepChoice } from '../src/lib/effect-values';

function spec(type: Parameters<typeof effectParamSpec>[0], id: string) {
  const found = effectParamSpec(type, id);
  if (found === undefined) {
    throw new Error(`no ${type}.${id}`);
  }
  return found;
}

describe('formatEffectValue', () => {
  it('writes each unit the way a mixer does', () => {
    expect(formatEffectValue(spec('delay', 'time'), 350)).toBe('350 ms');
    expect(formatEffectValue(spec('delay', 'time'), 1250)).toBe('1.25 s');
    expect(formatEffectValue(spec('eq', 'midFrequency'), 800)).toBe('800 Hz');
    expect(formatEffectValue(spec('eq', 'highCut'), 12500)).toBe('12.5 kHz');
    expect(formatEffectValue(spec('drive', 'gain'), 18)).toBe('+18.0 dB');
    expect(formatEffectValue(spec('drive', 'level'), -12)).toBe('−12.0 dB');
    expect(formatEffectValue(spec('chorus', 'mix'), 50)).toBe('50%');
    expect(formatEffectValue(spec('chorus', 'rate'), 0.8)).toBe('0.80 Hz');
    expect(formatEffectValue(spec('compressor', 'attack'), 10)).toBe('10 ms');
  });

  it('names a choice', () => {
    expect(formatEffectValue(spec('reverb', 'room'), 3)).toBe('Medium hall');
    expect(formatEffectValue(spec('cabinet', 'model'), 2)).toBe('4x12 closed back');
  });
});

describe('positionOfParam / paramFromPosition', () => {
  it('maps a linear range onto 0…1 and back', () => {
    const mix = spec('delay', 'mix');
    expect(positionOfParam(mix, 25)).toBeCloseTo(0.25);
    expect(paramFromPosition(mix, 0.5)).toBe(50);
  });

  it('maps frequencies and times on a logarithmic scale', () => {
    // Arrange
    const cut = spec('eq', 'highCut');

    // Act
    const middle = paramFromPosition(cut, 0.5);

    // Assert: the geometric middle of 1–20 kHz
    expect(middle).toBeCloseTo(Math.sqrt(1000 * 20000), -1);
    expect(positionOfParam(cut, middle)).toBeCloseTo(0.5, 2);
  });

  it('keeps positions and values in range', () => {
    const gain = spec('drive', 'gain');
    expect(paramFromPosition(gain, 2)).toBe(gain.max);
    expect(paramFromPosition(gain, -1)).toBe(gain.min);
    expect(positionOfParam(gain, 1000)).toBe(1);
  });
});

describe('stepChoice', () => {
  it('steps through a choice and wraps around', () => {
    const room = spec('reverb', 'room');
    expect(stepChoice(room, 3, 1)).toBe(4);
    expect(stepChoice(room, 8, 1)).toBe(0);
    expect(stepChoice(room, 0, -1)).toBe(8);
  });
});
