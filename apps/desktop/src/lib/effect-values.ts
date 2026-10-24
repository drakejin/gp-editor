import { type EffectParamSpec, type EffectType, clampEffectParam } from '@gp-editor/core';
import { isMessageKey, t } from './i18n/i18n';

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
    return `${(value / HERTZ_PER_KILOHERTZ).toFixed(1)} kHz`; // i18n-exempt: units
  }
  return value < SLOW_HERTZ ? `${value.toFixed(2)} Hz` : `${Math.round(value)} Hz`; // i18n-exempt: units
}

function formatMs(value: number): string {
  if (value >= MILLISECONDS_PER_SECOND) {
    return `${(value / MILLISECONDS_PER_SECOND).toFixed(2)} s`;
  }
  return Number.isInteger(value) ? `${value} ms` : `${value.toFixed(1)} ms`;
}

/** "Mid boost" → "midBoost", "1x12 open back" → "1x12OpenBack": a gp-core name as the end of a message key. */
export function nameKey(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)).join('');
}

/** A gp-core name (an effect's parameter, choice or preset) in the shown language; as written when it has no message. */
function translatedName(prefix: string, name: string): string {
  const key = `${prefix}.${nameKey(name)}`;
  return isMessageKey(key) ? t(key) : name;
}

/** "Compressor" / "컴프레서": an effect type's name. */
export function effectName(type: EffectType): string {
  return t(`tools.effect.name.${type}`);
}

/** A parameter's label ("Low cut"), from its English label (ids repeat across effects with other labels). */
export function effectParamLabel(spec: EffectParamSpec): string {
  return translatedName('tools.effect.param', spec.label);
}

/** One of a choice parameter's values ("Medium hall", "2x12 combo"). */
export function effectChoiceName(choice: string): string {
  return translatedName('tools.effect.choice', choice);
}

/** An effect preset's name ("Mid boost"); presets are applied and matched by their English name. */
export function effectPresetName(name: string): string {
  return translatedName('tools.effect.preset', name);
}

/** A whole chain preset's name ("Bass DI"). */
export function chainPresetName(name: string): string {
  return translatedName('tools.effect.chain', name);
}

/** "350 ms", "12.5 kHz", "+18.0 dB", "50%", or the choice's name. */
export function formatEffectValue(spec: EffectParamSpec, value: number): string {
  if (spec.choices !== undefined) {
    const choice = spec.choices[Math.round(value)];
    return choice === undefined ? String(value) : effectChoiceName(choice);
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
