// Values read from MusicXML elements (no TuxGuitar reader exists): numbers in range, pitches, and the reader's limits.
import { QUARTER_TIME } from '../../model/song';
import { parsePitch } from '../../transcription/pitch';
import { type XmlElement, child, childText, parseFloatOr } from '../gpif/xml';

/** Limits on what one file may make the reader build (larger files are refused, larger values clamped). */
export const MAX_PARTS = 64;
export const MAX_MEASURES = 4096;
/** Notes, rests and other elements in one measure of one part. */
export const MAX_MEASURE_ELEMENTS = 4096;
/** Positions past 16 whole notes into a measure are not read. */
export const MAX_MEASURE_TICKS = QUARTER_TIME * 4 * 16;
export const MAX_TEXT_LENGTH = 1024;
/** Divisions per quarter note beyond the model's own ticks add nothing (the writer uses at most QUARTER_TIME). */
export const MAX_DIVISIONS = QUARTER_TIME;

/** A finite number from the element's text; undefined when it is missing or not a decimal number. */
export function readNumber(text: string | undefined): number | undefined {
  const value = parseFloatOr(text, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

/** A whole number within min…max (rounded), else undefined. */
export function readIntegerIn(text: string | undefined, min: number, max: number): number | undefined {
  const value = readNumber(text);
  if (value === undefined) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Text of a name or label, trimmed and cut to MAX_TEXT_LENGTH. */
export function readText(text: string | undefined): string {
  return (text ?? '').trim().slice(0, MAX_TEXT_LENGTH);
}

const ACCIDENTALS: Readonly<Record<number, string>> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };
const MAX_ALTER = 2;

/** MIDI pitch of `<pitch>`-like content (`prefix` + step, alter, octave); undefined when it is not one in 0…127. */
export function readPitch(element: XmlElement | undefined, prefix = ''): number | undefined {
  const step = childText(element, `${prefix}step`)?.trim().toUpperCase();
  const octave = readIntegerIn(childText(element, `${prefix}octave`), 0, 9);
  const alter = clamp(Math.round(readNumber(childText(element, `${prefix}alter`)) ?? 0), -MAX_ALTER, MAX_ALTER);
  if (step === undefined || !/^[A-G]$/.test(step) || octave === undefined) {
    return undefined;
  }
  return parsePitch(`${step}${ACCIDENTALS[alter] ?? ''}${octave}`);
}

/** A length in divisions as ticks: QUARTER_TIME per quarter note, exact whenever the divisions divide it. */
export function divisionsToTicks(divisions: number, perQuarter: number): number {
  const ticksPerDivision = QUARTER_TIME / perQuarter;
  return Number.isInteger(ticksPerDivision) ? divisions * ticksPerDivision : (divisions * QUARTER_TIME) / perQuarter;
}

/** A child's presence, for empty elements such as `<chord/>`. */
export function has(element: XmlElement | undefined, name: string): boolean {
  return child(element, name) !== undefined;
}
