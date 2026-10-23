// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser#parseRhythm / #parseDynamic (LGPL-2.1).
import { NORMAL_TUPLET, NOTE_VALUES, STROKE_VALUES, plainDuration } from '../../model/defaults';
import type { Duration, NoteValue, Tuplet } from '../../model/song';
import { DEFAULT_VELOCITY, velocityFromGp } from '../common/velocity';
import type { GpifRhythm } from './gpif-document';
import { lookupName } from './xml';

const RHYTHM_NOTE_VALUES: Readonly<Record<string, NoteValue>> = {
  // Longer than whole and shorter than 64th do not exist in the model: use the nearest value
  // (TuxGuitar leaves them at its default, a quarter note).
  Long: 1,
  DoubleWhole: 1,
  Whole: 1,
  Half: 2,
  Quarter: 4,
  Eighth: 8,
  '16th': 16,
  '32nd': 32,
  '64th': 64,
  '128th': 64,
  '256th': 64,
};

const QUARTER_VALUE: NoteValue = 4;

/** Duration of a GPIF rhythm; a missing rhythm is a quarter note. */
export function rhythmDuration(rhythm: GpifRhythm | undefined): Duration {
  if (rhythm === undefined) {
    return plainDuration(QUARTER_VALUE);
  }
  return {
    value: lookupName(RHYTHM_NOTE_VALUES, rhythm.noteValue) ?? QUARTER_VALUE,
    dotted: rhythm.augmentationDotCount === 1,
    doubleDotted: rhythm.augmentationDotCount === 2,
    tuplet: tupletOf(rhythm.primaryTupletNum, rhythm.primaryTupletDen),
  };
}

function tupletOf(enters: number, times: number): Tuplet {
  return enters > 0 && times > 0 && !(enters === 1 && times === 1) ? { enters, times } : NORMAL_TUPLET;
}

/** Tremolo picking `<Tremolo>1/8</Tremolo>` → TGDuration value QUARTER * 8 = 32nd notes. */
export function tremoloPickingDuration(tremolo: readonly number[] | undefined): Duration | undefined {
  if (tremolo === undefined || tremolo.length !== 2) {
    return undefined;
  }
  const value = QUARTER_VALUE * (tremolo[1] ?? 0);
  return plainDuration(nearest(NOTE_VALUES, value));
}

/** The candidate closest to `value` on a log scale (note values are powers of two). */
function nearest<T extends number>(candidates: readonly [T, ...T[]], value: number): T {
  const target = Math.log2(Math.max(value, 1));
  const distance = (candidate: T): number => Math.abs(Math.log2(candidate) - target);
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

const DEFAULT_STROKE_VALUE = 32;
/** A brush of `ticks` ticks maps to the note value 1920 / ticks (60 ticks = 32, as GP5 speed 3 ↔ 32). */
export const STROKE_TICKS_TIMES_VALUE = 1920;

/** Stroke speed (note value) for a brush duration in ticks (XProperty 687935489). */
export function strokeValueFromTicks(brushTicks: number | undefined): number {
  if (brushTicks === undefined || brushTicks <= 0) {
    return DEFAULT_STROKE_VALUE;
  }
  return nearest(STROKE_VALUES, STROKE_TICKS_TIMES_VALUE / brushTicks);
}

/** GPIF dynamic names as GP dynamics (1 = ppp … 8 = fff). */
const DYNAMICS: Readonly<Record<string, number>> = {
  PPP: 1,
  PP: 2,
  P: 3,
  MP: 4,
  MF: 5,
  F: 6,
  FF: 7,
  FFF: 8,
};

/** MIDI velocity of a GPIF dynamic; a missing or unknown dynamic is TGVelocities.DEFAULT. */
export function dynamicVelocity(dynamic: string | undefined): number {
  const value = lookupName(DYNAMICS, dynamic);
  return value === undefined ? DEFAULT_VELOCITY : velocityFromGp(value);
}
