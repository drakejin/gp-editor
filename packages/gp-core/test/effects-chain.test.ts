import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MASTER,
  applyChainPreset,
  applyEffectPreset,
  deleteEffect,
  insertEffect,
  isDefaultMaster,
  matchingEffectPreset,
  moveEffect,
  setEffectParam,
  setMasterGain,
  toggleEffect,
} from '../src/effects/effect-chain';
import { MAX_TRACK_EFFECTS, buildEffect, effectParamSpec } from '../src/effects/effect-params';
import { CHAIN_PRESETS, EFFECT_PRESETS } from '../src/effects/effect-presets';
import type { Effect } from '../src/model/song';
import { deepFreeze } from './helpers/edit-songs';

function chain(): readonly Effect[] {
  return deepFreeze([buildEffect('drive'), buildEffect('cabinet'), buildEffect('reverb')]);
}

describe('insertEffect', () => {
  it('adds an effect at its default settings at the end, or at an index', () => {
    // Arrange
    const effects = chain();

    // Act
    const atEnd = insertEffect(effects, 'delay');
    const first = insertEffect(effects, 'eq', 0);

    // Assert
    expect(atEnd.map((effect) => effect.type)).toEqual(['drive', 'cabinet', 'reverb', 'delay']);
    expect(first.map((effect) => effect.type)).toEqual(['eq', 'drive', 'cabinet', 'reverb']);
    expect(first[1]).toBe(effects[0]);
    expect(effects).toHaveLength(3);
  });

  it('keeps a full chain, the limiter (master only) and a bad index out', () => {
    const full = deepFreeze(Array.from({ length: MAX_TRACK_EFFECTS }, () => buildEffect('eq')));
    expect(insertEffect(full, 'delay')).toBe(full);
    const effects = chain();
    expect(insertEffect(effects, 'limiter')).toBe(effects);
    expect(insertEffect(effects, 'eq', 7)).toBe(effects);
    expect(insertEffect(effects, 'eq', -1)).toBe(effects);
  });
});

describe('deleteEffect / moveEffect / toggleEffect', () => {
  it('deletes the effect at an index', () => {
    expect(deleteEffect(chain(), 1).map((effect) => effect.type)).toEqual(['drive', 'reverb']);
    const effects = chain();
    expect(deleteEffect(effects, 3)).toBe(effects);
  });

  it('moves an effect to another place in the chain', () => {
    // Arrange
    const effects = chain();

    // Act
    const moved = moveEffect(effects, 2, 0);

    // Assert
    expect(moved.map((effect) => effect.type)).toEqual(['reverb', 'drive', 'cabinet']);
    expect(moveEffect(effects, 0, 2).map((effect) => effect.type)).toEqual(['cabinet', 'reverb', 'drive']);
    expect(moveEffect(effects, 1, 1)).toBe(effects);
    expect(moveEffect(effects, 0, 3)).toBe(effects);
  });

  it('switches an effect off and on', () => {
    const off = toggleEffect(chain(), 0);
    expect(off[0]?.isEnabled).toBe(false);
    expect(toggleEffect(off, 0)[0]?.isEnabled).toBe(true);
    const effects = chain();
    expect(toggleEffect(effects, 9)).toBe(effects);
  });
});

describe('setEffectParam', () => {
  it('sets one parameter, clamped to its range', () => {
    // Arrange
    const effects = chain();
    const gain = effectParamSpec('drive', 'gain');

    // Act
    const louder = setEffectParam(effects, 0, 'gain', 1000);

    // Assert
    expect(louder[0]?.params.gain).toBe(gain?.max);
    expect(louder[1]).toBe(effects[1]);
  });

  it('returns the same chain for an unknown parameter, the same value or a missing effect', () => {
    const effects = chain();
    expect(setEffectParam(effects, 0, 'feedback', 3)).toBe(effects);
    expect(setEffectParam(effects, 0, 'gain', effects[0]?.params.gain ?? 0)).toBe(effects);
    expect(setEffectParam(effects, 5, 'gain', 3)).toBe(effects);
  });
});

describe('presets', () => {
  it('has a preset list per effect type whose values are in range', () => {
    for (const [type, presets] of Object.entries(EFFECT_PRESETS)) {
      for (const preset of presets) {
        const effect = applyEffectPreset([buildEffect(type as Effect['type'])], 0, preset.name)[0];
        expect(effect?.params).toEqual({ ...buildEffect(type as Effect['type']).params, ...preset.params });
      }
    }
  });

  it('applies an effect preset and recognises it afterwards', () => {
    // Arrange
    const effects = chain();
    const name = EFFECT_PRESETS.drive[1]?.name ?? '';

    // Act
    const preset = applyEffectPreset(effects, 0, name);

    // Assert
    expect(matchingEffectPreset(preset[0] ?? buildEffect('drive'))).toBe(name);
    expect(applyEffectPreset(effects, 0, 'No such preset')).toBe(effects);
    expect(matchingEffectPreset(setEffectParam(preset, 0, 'gain', 1)[0] ?? buildEffect('drive'))).toBeUndefined();
  });

  it('has the chain presets Clean, Crunch, Lead and Bass DI within the chain limit', () => {
    const names = CHAIN_PRESETS.map((preset) => preset.name);
    expect(names).toEqual(expect.arrayContaining(['Clean', 'Crunch', 'Lead', 'Bass DI']));
    for (const preset of CHAIN_PRESETS) {
      expect(preset.effects.length).toBeLessThanOrEqual(MAX_TRACK_EFFECTS);
      expect(preset.effects.every((effect) => effect.type !== 'limiter')).toBe(true);
    }
    expect(applyChainPreset('Crunch')?.map((effect) => effect.type)).toContain('drive');
    expect(applyChainPreset('Nope')).toBeUndefined();
  });
});

describe('master mix', () => {
  it('starts with only the limiter on at 0 dB, the level playback always had', () => {
    expect(DEFAULT_MASTER.effects.map((effect) => [effect.type, effect.isEnabled])).toEqual([
      ['eq', false],
      ['compressor', false],
      ['reverb', false],
      ['limiter', true],
    ]);
    expect(DEFAULT_MASTER.gainDb).toBe(0);
    expect(isDefaultMaster(DEFAULT_MASTER)).toBe(true);
  });

  it('sets the output gain within −24…+12 dB', () => {
    expect(setMasterGain(DEFAULT_MASTER, 30).gainDb).toBe(12);
    expect(setMasterGain(DEFAULT_MASTER, -40).gainDb).toBe(-24);
    expect(setMasterGain(DEFAULT_MASTER, 0)).toBe(DEFAULT_MASTER);
    expect(setMasterGain(DEFAULT_MASTER, Number.NaN)).toBe(DEFAULT_MASTER);
    expect(isDefaultMaster(setMasterGain(DEFAULT_MASTER, -3))).toBe(false);
    expect(isDefaultMaster({ ...DEFAULT_MASTER, effects: toggleEffect(DEFAULT_MASTER.effects, 2) })).toBe(false);
  });
});
