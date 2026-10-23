// The app's playback effects (not in TuxGuitar): each type's parameters with their ranges and defaults. The macOS
// engine (GPEffectNodes.m) reads the same ids; Guitar Pro's own RSE settings are not read for sound.
import type { Effect, EffectType } from '../model/song';

export type EffectParamUnit = 'dB' | 'Hz' | 'ms' | '%' | '';

export interface EffectParamSpec {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly unit: EffectParamUnit;
  /** Values are rounded to a multiple of this (1 for choices). */
  readonly step: number;
  /** A slider on a logarithmic scale (frequencies, times). */
  readonly isLogarithmic?: boolean;
  /** Named values 0…n−1: a choice instead of a range. */
  readonly choices?: readonly string[];
}

/** The speaker cabinets the cabinet effect convolves with (impulse responses the engine generates). */
export const CABINET_MODELS: readonly string[] = ['1x12 open back', '2x12 combo', '4x12 closed back', '4x10 bass'];
/** The reverb's rooms, in the order of the macOS reverb's factory presets. */
export const REVERB_ROOMS: readonly string[] = [
  'Small room',
  'Medium room',
  'Large room',
  'Medium hall',
  'Large hall',
  'Plate',
  'Medium chamber',
  'Large chamber',
  'Cathedral',
];
export const DRIVE_MODES: readonly string[] = ['Overdrive', 'Distortion', 'Fuzz'];

/** Most effects one track's chain holds. */
export const MAX_TRACK_EFFECTS = 8;
/** The effects a track's chain may hold (the limiter is the master's). */
export const TRACK_EFFECT_TYPES: readonly EffectType[] = ['eq', 'compressor', 'drive', 'chorus', 'delay', 'reverb', 'cabinet'];
/** The master strip, in signal order. */
export const MASTER_EFFECT_TYPES: readonly EffectType[] = ['eq', 'compressor', 'reverb', 'limiter'];

export const EFFECT_NAMES: Readonly<Record<EffectType, string>> = {
  eq: 'EQ',
  compressor: 'Compressor',
  drive: 'Drive',
  chorus: 'Chorus',
  delay: 'Delay',
  reverb: 'Reverb',
  cabinet: 'Cabinet',
  limiter: 'Limiter',
};

type SpecOptions = Pick<EffectParamSpec, 'step' | 'isLogarithmic'>;

function range(id: string, label: string, [min, max, defaultValue]: readonly [number, number, number], unit: EffectParamUnit, options: Partial<SpecOptions> = {}): EffectParamSpec {
  return { id, label, min, max, defaultValue, unit, step: options.step ?? 1, ...(options.isLogarithmic === true ? { isLogarithmic: true } : {}) };
}

function choice(id: string, label: string, choices: readonly string[], defaultValue: number): EffectParamSpec {
  return { id, label, min: 0, max: choices.length - 1, defaultValue, unit: '', step: 1, choices };
}

const HALF_DB = { step: 0.5 } as const;
const LOG = { isLogarithmic: true } as const;

/** Every type's parameters, in the order the inspector shows them. */
export const EFFECT_PARAMS: Readonly<Record<EffectType, readonly EffectParamSpec[]>> = {
  eq: [
    range('lowCut', 'Low cut', [20, 600, 20], 'Hz', LOG),
    range('lowGain', 'Bass', [-15, 15, 0], 'dB', HALF_DB),
    range('midFrequency', 'Mid freq', [200, 5000, 800], 'Hz', LOG),
    range('midGain', 'Middle', [-15, 15, 0], 'dB', HALF_DB),
    range('highGain', 'Treble', [-15, 15, 0], 'dB', HALF_DB),
    range('highCut', 'High cut', [1000, 20000, 20000], 'Hz', LOG),
  ],
  compressor: [
    range('threshold', 'Threshold', [-40, 0, -18], 'dB', HALF_DB),
    range('headroom', 'Headroom', [1, 40, 6], 'dB', HALF_DB),
    range('attack', 'Attack', [1, 300, 10], 'ms', LOG),
    range('release', 'Release', [10, 3000, 150], 'ms', LOG),
    range('gain', 'Gain', [-12, 24, 3], 'dB', HALF_DB),
  ],
  drive: [
    choice('mode', 'Type', DRIVE_MODES, 0),
    range('gain', 'Drive', [0, 48, 18], 'dB', HALF_DB),
    range('tone', 'Tone', [0, 100, 50], '%'),
    range('level', 'Level', [-36, 6, -12], 'dB', HALF_DB),
  ],
  chorus: [
    range('rate', 'Rate', [0.05, 5, 0.8], 'Hz', { step: 0.01, isLogarithmic: true }),
    range('depth', 'Depth', [0, 8, 2.5], 'ms', { step: 0.1 }),
    range('delay', 'Delay', [5, 30, 12], 'ms', { step: 0.1 }),
    range('mix', 'Mix', [0, 100, 50], '%'),
  ],
  delay: [
    range('time', 'Time', [10, 2000, 350], 'ms', LOG),
    range('feedback', 'Feedback', [0, 95, 30], '%'),
    range('tone', 'Tone', [500, 20000, 6000], 'Hz', LOG),
    range('mix', 'Mix', [0, 100, 25], '%'),
  ],
  reverb: [choice('room', 'Room', REVERB_ROOMS, 3), range('mix', 'Mix', [0, 100, 25], '%')],
  cabinet: [choice('model', 'Cabinet', CABINET_MODELS, 0), range('mix', 'Mix', [0, 100, 100], '%'), range('level', 'Level', [-12, 12, 0], 'dB', HALF_DB)],
  // The macOS peak limiter's own defaults (release 5 ms, no pre-gain), so the default master sounds as before.
  limiter: [range('gain', 'Gain', [-12, 12, 0], 'dB', HALF_DB), range('release', 'Release', [1, 40, 5], 'ms')],
};

export function effectParamSpec(type: EffectType, id: string): EffectParamSpec | undefined {
  return EFFECT_PARAMS[type].find((spec) => spec.id === id);
}

/** Digits a rounded value keeps, so steps like 0.1 do not leave 0.30000000000000004. */
const VALUE_DIGITS = 6;

/** The value inside the parameter's range, on its step; the default for anything that is not a finite number. */
export function clampEffectParam(spec: EffectParamSpec, value: number): number {
  if (!Number.isFinite(value)) {
    return spec.defaultValue;
  }
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  const stepped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  return Number(Math.min(spec.max, stepped).toFixed(VALUE_DIGITS));
}

export function defaultEffectParams(type: EffectType): Readonly<Record<string, number>> {
  return Object.fromEntries(EFFECT_PARAMS[type].map((spec) => [spec.id, spec.defaultValue]));
}

/** An effect of `type` with every parameter at its default. */
export function buildEffect(type: EffectType, isEnabled = true): Effect {
  return { type, isEnabled, params: defaultEffectParams(type) };
}
