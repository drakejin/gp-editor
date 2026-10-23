import { type EffectParamSpec, clampEffectParam } from '@gp-editor/core';

const MINUS = '−';
const MILLISECONDS_PER_SECOND = 1000;
const HERTZ_PER_KILOHERTZ = 1000;
/** Below this, a frequency shows hundredths (an LFO's rate). */
const SLOW_HERTZ = 10;

function formatDb(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return `${value > 0 ? '+' : value < 0 ? MINUS : ''}${text} dB`;
}

function formatHz(value: number): string {
  if (value >= HERTZ_PER_KILOHERTZ) {
    return `${(value / HERTZ_PER_KILOHERTZ).toFixed(1)} kHz`;
  }
  return value < SLOW_HERTZ ? `${value.toFixed(2)} Hz` : `${Math.round(value)} Hz`;
}

function formatMs(value: number): string {
  if (value >= MILLISECONDS_PER_SECOND) {
    return `${(value / MILLISECONDS_PER_SECOND).toFixed(2)} s`;
  }
  return Number.isInteger(value) ? `${value} ms` : `${value.toFixed(1)} ms`;
}

/** "350 ms", "12.5 kHz", "+18.0 dB", "50%", or the choice's name. */
export function formatEffectValue(spec: EffectParamSpec, value: number): string {
  if (spec.choices !== undefined) {
    return spec.choices[Math.round(value)] ?? String(value);
  }
  switch (spec.unit) {
    case 'dB':
      return formatDb(value);
    case 'Hz':
      return formatHz(value);
    case 'ms':
      return formatMs(value);
    case '%':
      return `${Math.round(value)}%`;
    default:
      return String(value);
  }
}

function clampUnit(position: number): number {
  return Math.min(1, Math.max(0, position));
}

/** Where a value sits on its slider, 0…1 (logarithmic for frequencies and times). */
export function positionOfParam(spec: EffectParamSpec, value: number): number {
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.isLogarithmic === true && spec.min > 0) {
    return clampUnit(Math.log(clamped / spec.min) / Math.log(spec.max / spec.min));
  }
  return clampUnit((clamped - spec.min) / (spec.max - spec.min));
}

/** The value at a slider position (0…1), on the parameter's step. */
export function paramFromPosition(spec: EffectParamSpec, position: number): number {
  const at = clampUnit(position);
  const raw = spec.isLogarithmic === true && spec.min > 0 ? spec.min * Math.pow(spec.max / spec.min, at) : spec.min + at * (spec.max - spec.min);
  return clampEffectParam(spec, raw);
}

/** The next (1) or previous (−1) choice, wrapping around. */
export function stepChoice(spec: EffectParamSpec, value: number, delta: 1 | -1): number {
  const count = spec.max - spec.min + 1;
  return spec.min + ((((Math.round(value) - spec.min + delta) % count) + count) % count);
}
