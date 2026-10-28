// Named settings for the app's playback effects (not in TuxGuitar): one list per effect type, and whole track chains.
import type { Effect, EffectType } from '../model/song';
import { defaultEffectParams } from './effect-params';

export interface EffectPreset {
  readonly name: string;
  /** The values that differ from the type's defaults; applying it sets every other parameter to its default. */
  readonly params: Readonly<Record<string, number>>;
}

export interface ChainPreset {
  readonly name: string;
  readonly effects: readonly Effect[];
}

export const EFFECT_PRESETS: Readonly<Record<EffectType, readonly EffectPreset[]>> = {
  eq: [
    { name: 'Flat', params: {} },
    { name: 'Scoop', params: { lowGain: 3, midFrequency: 650, midGain: -6, highGain: 3 } },
    { name: 'Mid boost', params: { midFrequency: 900, midGain: 5 } },
    { name: 'Bright', params: { highGain: 5 } },
    { name: 'Warm', params: { lowGain: 3, highGain: -4 } },
    { name: 'Bass cut', params: { lowCut: 120 } },
  ],
  compressor: [
    { name: 'Gentle', params: { threshold: -14, headroom: 10, attack: 20, release: 200, gain: 2 } },
    { name: 'Squash', params: { threshold: -28, headroom: 3, attack: 2, release: 100, gain: 8 } },
    { name: 'Bass', params: { threshold: -20, headroom: 5, attack: 10, release: 150, gain: 4 } },
  ],
  drive: [
    { name: 'Boost', params: { mode: 0, gain: 6, tone: 60, level: -3 } },
    { name: 'Crunch', params: { mode: 0, gain: 16, tone: 55, level: -10 } },
    { name: 'Lead', params: { mode: 1, gain: 34, tone: 60, level: -18 } },
    { name: 'Metal', params: { mode: 1, gain: 44, tone: 65, level: -20 } },
    { name: 'Fuzz', params: { mode: 2, gain: 36, tone: 45, level: -18 } },
  ],
  chorus: [
    { name: 'Subtle', params: { rate: 0.6, depth: 1.5, delay: 10, mix: 35 } },
    { name: 'Classic', params: {} },
    { name: 'Deep', params: { rate: 0.3, depth: 6, delay: 18, mix: 55 } },
  ],
  delay: [
    { name: 'Slapback', params: { time: 110, feedback: 5, tone: 5000, mix: 25 } },
    { name: 'Echo', params: {} },
    { name: 'Long', params: { time: 700, feedback: 45, tone: 4000, mix: 30 } },
  ],
  reverb: [
    { name: 'Room', params: { room: 1, mix: 20 } },
    { name: 'Hall', params: {} },
    { name: 'Plate', params: { room: 5, mix: 25 } },
    { name: 'Cathedral', params: { room: 8, mix: 35 } },
  ],
  cabinet: [
    { name: 'Open back', params: { model: 0 } },
    { name: 'Combo', params: { model: 1 } },
    { name: 'Closed back', params: { model: 2 } },
    { name: 'Bass', params: { model: 3 } },
  ],
  limiter: [
    { name: 'Safe', params: {} },
    { name: 'Loud', params: { gain: 6, release: 20 } },
  ],
};

/** An enabled effect of `type` with the named preset's values (the defaults when there is no such preset). */
function presetEffect(type: EffectType, presetName: string, overrides: Readonly<Record<string, number>> = {}): Effect {
  const preset = EFFECT_PRESETS[type].find((candidate) => candidate.name === presetName);
  return { type, isEnabled: true, params: { ...defaultEffectParams(type), ...preset?.params, ...overrides } };
}

/** Whole chains for a track, from the Track inspector's preset menu. */
export const CHAIN_PRESETS: readonly ChainPreset[] = [
  {
    name: 'Clean',
    effects: [presetEffect('compressor', 'Gentle'), presetEffect('eq', 'Flat', { highGain: 2 }), presetEffect('cabinet', 'Combo'), presetEffect('reverb', 'Room')],
  },
  {
    name: 'Crunch',
    effects: [presetEffect('drive', 'Crunch'), presetEffect('eq', 'Flat', { midGain: 3 }), presetEffect('cabinet', 'Open back'), presetEffect('reverb', 'Room', { mix: 15 })],
  },
  {
    name: 'Lead',
    effects: [
      presetEffect('compressor', 'Gentle'),
      presetEffect('drive', 'Lead'),
      presetEffect('eq', 'Mid boost'),
      presetEffect('cabinet', 'Closed back'),
      presetEffect('delay', 'Echo', { mix: 20 }),
      presetEffect('reverb', 'Hall', { mix: 20 }),
    ],
  },
  {
    name: 'Metal',
    effects: [presetEffect('eq', 'Bass cut'), presetEffect('drive', 'Metal'), presetEffect('eq', 'Scoop'), presetEffect('cabinet', 'Closed back'), presetEffect('reverb', 'Room', { mix: 12 })],
  },
  { name: 'Bass DI', effects: [presetEffect('compressor', 'Bass'), presetEffect('eq', 'Flat', { lowGain: 3, midFrequency: 700, midGain: -2, highGain: 1 })] },
  { name: 'Bass amp', effects: [presetEffect('compressor', 'Bass'), presetEffect('drive', 'Boost'), presetEffect('cabinet', 'Bass')] },
  { name: 'Acoustic', effects: [presetEffect('compressor', 'Gentle'), presetEffect('eq', 'Flat', { lowCut: 80, midFrequency: 300, midGain: -3, highGain: 3 }), presetEffect('reverb', 'Plate', { mix: 18 })] },
  { name: 'Ambient', effects: [presetEffect('chorus', 'Deep'), presetEffect('delay', 'Long'), presetEffect('reverb', 'Cathedral')] },
];
