// Changes to an effect chain (a track's effects or the master strip), each returning a new chain (not in TuxGuitar).
// Every function returns the chain it was given when nothing changes, like the song edits.
import type { Effect, EffectType, MasterMix } from '../model/song';
import { MASTER_EFFECT_TYPES, MAX_TRACK_EFFECTS, TRACK_EFFECT_TYPES, buildEffect, clampEffectParam, defaultEffectParams, effectParamSpec } from './effect-params';
import { CHAIN_PRESETS, EFFECT_PRESETS } from './effect-presets';

/** The master's output gain range in dB. */
export const MASTER_GAIN = { min: -24, max: 12 } as const;

/** The master strip with only the limiter on, at 0 dB: what playback sounded like before effects. */
export const DEFAULT_MASTER: MasterMix = {
  effects: MASTER_EFFECT_TYPES.map((type) => buildEffect(type, type === 'limiter')),
  gainDb: 0,
};

function isIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function replaceEffect(chain: readonly Effect[], index: number, change: (effect: Effect) => Effect): readonly Effect[] {
  const effect = chain[index];
  const next = effect === undefined ? undefined : change(effect);
  return next === undefined || next === effect ? chain : chain.map((existing, i) => (i === index ? next : existing));
}

/** A new track effect at its defaults, at `index` (the end by default); the same chain when full or for the limiter. */
export function insertEffect(chain: readonly Effect[], type: EffectType, index = chain.length): readonly Effect[] {
  const isPlace = Number.isInteger(index) && index >= 0 && index <= chain.length;
  if (!TRACK_EFFECT_TYPES.includes(type) || chain.length >= MAX_TRACK_EFFECTS || !isPlace) {
    return chain;
  }
  return [...chain.slice(0, index), buildEffect(type), ...chain.slice(index)];
}

export function deleteEffect(chain: readonly Effect[], index: number): readonly Effect[] {
  return isIndex(index, chain.length) ? chain.filter((_, i) => i !== index) : chain;
}

/** The effect at `from` moved to `to` (both 0-based places in the chain). */
export function moveEffect(chain: readonly Effect[], from: number, to: number): readonly Effect[] {
  const effect = chain[from];
  if (effect === undefined || !isIndex(to, chain.length) || from === to) {
    return chain;
  }
  const without = chain.filter((_, i) => i !== from);
  return [...without.slice(0, to), effect, ...without.slice(to)];
}

export function toggleEffect(chain: readonly Effect[], index: number): readonly Effect[] {
  return replaceEffect(chain, index, (effect) => ({ ...effect, isEnabled: !effect.isEnabled }));
}

/** One parameter of the effect at `index`, clamped to its range; unknown parameters change nothing. */
export function setEffectParam(chain: readonly Effect[], index: number, paramId: string, value: number): readonly Effect[] {
  return replaceEffect(chain, index, (effect) => {
    const spec = effectParamSpec(effect.type, paramId);
    if (spec === undefined) {
      return effect;
    }
    const next = clampEffectParam(spec, value);
    return effect.params[paramId] === next ? effect : { ...effect, params: { ...effect.params, [paramId]: next } };
  });
}

function presetParams(type: EffectType, presetName: string): Readonly<Record<string, number>> | undefined {
  const preset = EFFECT_PRESETS[type].find((candidate) => candidate.name === presetName);
  return preset === undefined ? undefined : { ...defaultEffectParams(type), ...preset.params };
}

/** The effect at `index` with a preset of its type (every other parameter at its default). */
export function applyEffectPreset(chain: readonly Effect[], index: number, presetName: string): readonly Effect[] {
  return replaceEffect(chain, index, (effect) => {
    const params = presetParams(effect.type, presetName);
    return params === undefined ? effect : { ...effect, params };
  });
}

/** The name of the preset whose values the effect has, if any. */
export function matchingEffectPreset(effect: Effect): string | undefined {
  return EFFECT_PRESETS[effect.type].find((preset) => {
    const params = presetParams(effect.type, preset.name) ?? {};
    return Object.entries(params).every(([id, value]) => effect.params[id] === value);
  })?.name;
}

/** The effects of a named chain preset (Clean, Crunch, Lead, Bass DI …); undefined for an unknown name. */
export function applyChainPreset(presetName: string): readonly Effect[] | undefined {
  return CHAIN_PRESETS.find((preset) => preset.name === presetName)?.effects;
}

/** The master with its output gain at `gainDb` (rounded to 0.5 dB, −24…+12). */
export function setMasterGain(master: MasterMix, gainDb: number): MasterMix {
  if (!Number.isFinite(gainDb)) {
    return master;
  }
  const next = Math.round(Math.min(MASTER_GAIN.max, Math.max(MASTER_GAIN.min, gainDb)) * 2) / 2;
  return next === master.gainDb ? master : { ...master, gainDb: next };
}

/** Same type, on/off state and parameter values. */
export function isSameEffect(a: Effect | undefined, b: Effect): boolean {
  const ids = Object.keys(b.params);
  return (
    a !== undefined &&
    a.type === b.type &&
    a.isEnabled === b.isEnabled &&
    Object.keys(a.params).length === ids.length &&
    ids.every((id) => a.params[id] === b.params[id])
  );
}

/** Same effects in the same order. */
export function isSameChain(a: readonly Effect[], b: readonly Effect[]): boolean {
  return a.length === b.length && b.every((effect, index) => isSameEffect(a[index], effect));
}

export function isSameMaster(a: MasterMix, b: MasterMix): boolean {
  return a.gainDb === b.gainDb && isSameChain(a.effects, b.effects);
}

/** True when the master sounds as the default does (so a song need not keep it). */
export function isDefaultMaster(master: MasterMix): boolean {
  return isSameMaster(master, DEFAULT_MASTER);
}
