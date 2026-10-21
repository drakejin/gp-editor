// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser#parseRhythm / #parseDynamic and TGDuration#fromTime (LGPL-2.1).
import { NORMAL_TUPLET, durationTicks } from '../../model/defaults';
import type { Duration, NoteValue, Tuplet } from '../../model/song';
import type { GpifRhythm } from './gpif-document';

const NOTE_VALUES: Readonly<Record<string, NoteValue>> = {
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
    value: NOTE_VALUES[rhythm.noteValue ?? ''] ?? QUARTER_VALUE,
    dotted: rhythm.augmentationDotCount === 1,
    doubleDotted: rhythm.augmentationDotCount === 2,
    tuplet: tupletOf(rhythm.primaryTupletNum, rhythm.primaryTupletDen),
  };
}

function tupletOf(enters: number, times: number): Tuplet {
  return enters > 0 && times > 0 && !(enters === 1 && times === 1) ? { enters, times } : NORMAL_TUPLET;
}

export function plainDuration(value: NoteValue): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

const PLAIN_VALUES: readonly [NoteValue, ...NoteValue[]] = [1, 2, 4, 8, 16, 32, 64];

/** TuxGuitar's shortest duration: a 64th in a 7:4 tuplet. */
const SHORTEST: Duration = { value: 64, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } };

/**
 * TGDuration.fromTime(factory, time): the longest plain note value that fits in `ticks`, else the
 * shortest duration. (Its exact-match table is keyed by "precise" times and never matches ticks.)
 */
export function durationFromTicks(ticks: number): Duration {
  for (const value of PLAIN_VALUES) {
    const duration = plainDuration(value);
    if (ticks >= durationTicks(duration)) {
      return duration;
    }
  }
  return SHORTEST;
}

/** Tremolo picking `<Tremolo>1/8</Tremolo>` → TGDuration value QUARTER * 8 = 32nd notes. */
export function tremoloPickingDuration(tremolo: readonly number[] | undefined): Duration | undefined {
  if (tremolo === undefined || tremolo.length !== 2) {
    return undefined;
  }
  const value = QUARTER_VALUE * (tremolo[1] ?? 0);
  return plainDuration(nearest(PLAIN_VALUES, value));
}

/** The candidate closest to `value` on a log scale (note values are powers of two). */
function nearest<T extends number>(candidates: readonly [T, ...T[]], value: number): T {
  const target = Math.log2(Math.max(value, 1));
  const distance = (candidate: T): number => Math.abs(Math.log2(candidate) - target);
  return candidates.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
}

const STROKE_VALUES: readonly [number, ...number[]] = [4, 8, 16, 32, 64, 128];
const DEFAULT_STROKE_VALUE = 32;
/** A brush of `ticks` ticks maps to the note value 1920 / ticks (60 ticks = 32, as GP5 speed 3 ↔ 32). */
const STROKE_TICKS_TIMES_VALUE = 1920;

/** Stroke speed (note value) for a brush duration in ticks (XProperty 687935489). */
export function strokeValue(brushTicks: number | undefined): number {
  if (brushTicks === undefined || brushTicks <= 0) {
    return DEFAULT_STROKE_VALUE;
  }
  return nearest(STROKE_VALUES, STROKE_TICKS_TIMES_VALUE / brushTicks);
}

/** TGVelocities for GPIF dynamics. */
const VELOCITIES: Readonly<Record<string, number>> = {
  PPP: 15,
  PP: 31,
  P: 47,
  MP: 63,
  MF: 79,
  F: 95,
  FF: 111,
  FFF: 127,
};
const DEFAULT_VELOCITY = 95;

export function dynamicVelocity(dynamic: string | undefined): number {
  return VELOCITIES[dynamic ?? ''] ?? DEFAULT_VELOCITY;
}
