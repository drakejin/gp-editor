import { describe, expect, it } from 'vitest';
import {
  CABINET_MODELS,
  EFFECT_NAMES,
  EFFECT_PARAMS,
  MASTER_EFFECT_TYPES,
  MAX_TRACK_EFFECTS,
  REVERB_ROOMS,
  TRACK_EFFECT_TYPES,
  buildEffect,
  clampEffectParam,
  effectParamSpec,
} from '../src/effects/effect-params';
import type { EffectType } from '../src/model/song';

const ALL_TYPES: readonly EffectType[] = ['eq', 'compressor', 'drive', 'chorus', 'delay', 'reverb', 'cabinet', 'limiter'];

describe('EFFECT_PARAMS', () => {
  it('names every effect type and gives each parameter a default inside its range', () => {
    for (const type of ALL_TYPES) {
      expect(EFFECT_NAMES[type]).not.toBe('');
      const specs = EFFECT_PARAMS[type];
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec.min).toBeLessThan(spec.max);
        expect(spec.defaultValue).toBeGreaterThanOrEqual(spec.min);
        expect(spec.defaultValue).toBeLessThanOrEqual(spec.max);
        expect(spec.step).toBeGreaterThan(0);
        if (spec.choices !== undefined) {
          expect(spec.max).toBe(spec.choices.length - 1);
        }
      }
      expect(new Set(specs.map((spec) => spec.id)).size).toBe(specs.length);
    }
  });

  it('offers the cabinet models and reverb rooms as choices', () => {
    expect(effectParamSpec('cabinet', 'model')?.choices).toBe(CABINET_MODELS);
    expect(effectParamSpec('reverb', 'room')?.choices).toBe(REVERB_ROOMS);
    expect(CABINET_MODELS.length).toBeGreaterThanOrEqual(2);
    expect(effectParamSpec('reverb', 'nope')).toBeUndefined();
  });

  it('lets tracks use every effect but the limiter, and gives the master a fixed strip', () => {
    expect(TRACK_EFFECT_TYPES).not.toContain('limiter');
    expect(TRACK_EFFECT_TYPES).toContain('cabinet');
    expect(MASTER_EFFECT_TYPES).toEqual(['eq', 'compressor', 'reverb', 'limiter']);
    expect(MAX_TRACK_EFFECTS).toBe(8);
  });
});

describe('buildEffect', () => {
  it('builds an enabled effect with every parameter at its default', () => {
    // Act
    const delay = buildEffect('delay');

    // Assert
    expect(delay.type).toBe('delay');
    expect(delay.isEnabled).toBe(true);
    expect(Object.keys(delay.params).sort()).toEqual(EFFECT_PARAMS.delay.map((spec) => spec.id).sort());
    expect(delay.params.time).toBe(effectParamSpec('delay', 'time')?.defaultValue);
  });

  it('builds a disabled effect when asked', () => {
    expect(buildEffect('reverb', false).isEnabled).toBe(false);
  });
});

describe('clampEffectParam', () => {
  it('keeps a value inside its range and on its step', () => {
    // Arrange
    const gain = effectParamSpec('drive', 'gain');
    const room = effectParamSpec('reverb', 'room');
    if (gain === undefined || room === undefined) {
      throw new Error('missing spec');
    }

    // Act / Assert
    expect(clampEffectParam(gain, gain.max + 100)).toBe(gain.max);
    expect(clampEffectParam(gain, gain.min - 100)).toBe(gain.min);
    expect(clampEffectParam(room, 2.4)).toBe(2);
    expect(clampEffectParam(room, 2.6)).toBe(3);
  });

  it('turns a value that is not a number into the default', () => {
    const mix = effectParamSpec('chorus', 'mix');
    if (mix === undefined) {
      throw new Error('missing spec');
    }
    expect(clampEffectParam(mix, Number.NaN)).toBe(mix.defaultValue);
    expect(clampEffectParam(mix, Number.POSITIVE_INFINITY)).toBe(mix.defaultValue);
  });
});
