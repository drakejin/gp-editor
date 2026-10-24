// Inverses of the GP3–GP5 readers' unit conversions (TuxGuitar GP5OutputStream helpers, LGPL-2.1), so that write → read is lossless.
import { BEND_MAX_POSITION, GP_QUARTER_TONE, GTP_BEND_POSITIONS } from '../formats/common/bend-units';
import {
  GP5_ONLY_TUPLET,
  GRACE_TRANSITIONS,
  GTP_TUPLETS,
  type NoteValueCode,
  STROKE_SPEED_CODES,
  TREMOLO_PICKING_CODES,
  TRILL_PERIOD_CODES,
  gtpTupletOf,
} from '../formats/common/gtp-codes';
import { MAX_VELOCITY } from '../formats/common/velocity';
import { durationTicks, NORMAL_TUPLET, NOTE_VALUES } from '../model/defaults';
import type { Duration, GraceTransition, NoteValue, Tuplet } from '../model/song';
/** One GP dynamic step in velocity, and one channel-byte step in MIDI value. */
const DYNAMIC_STEP = 16;
const CHANNEL_STEP = 8;
const MAX_CHANNEL_BYTE = 16;
const MAX_DYNAMIC = 8;

/** Model position 0…12 → GP 0…60 (the reader rounds raw × 12 / 60). */
export function bendPositionToGp(position: number): number {
  return Math.round((position * GTP_BEND_POSITIONS) / BEND_MAX_POSITION);
}

/** Quarter tones → GP 1/100 tones, for bends and the tremolo bar (the readers divide by 25). */
export function bendValueToGp(value: number): number {
  return Math.round(value * GP_QUARTER_TONE);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * MIDI velocity → GP dynamic (1 = ppp … 8 = fff; 0 reads back as velocity 0). Inverse of velocityFromGp
 * (16 × dynamic − 1); velocities between two dynamics take the nearest (TuxGuitar truncates).
 */
export function dynamicFromVelocity(velocity: number): number {
  return clamp(Math.round((clamp(velocity, 0, MAX_VELOCITY) + 1) / DYNAMIC_STEP), 0, MAX_DYNAMIC);
}

/** MIDI value 0…127 → GP channel byte 0…16 (the readers compute byte × 8 − 1); nearest step. */
export function channelValueToGp(value: number): number {
  return clamp(Math.round((clamp(value, 0, MAX_VELOCITY) + 1) / CHANNEL_STEP), 0, MAX_CHANNEL_BYTE);
}

/** Note value → signed duration byte: -2 = whole, 0 = quarter, 4 = 64th (GP5OutputStream.parseDuration). */
export function durationValueToGp(value: NoteValue): number {
  return Math.round(Math.log2(value)) - 2;
}

/** The tuplet division to write; undefined for a normal duration or a tuplet Guitar Pro cannot store. */
export function tupletDivisionToGp(tuplet: Tuplet, allowThirteen: boolean): number | undefined {
  return gtpTupletOf(tuplet.enters, allowThirteen)?.times === tuplet.times ? tuplet.enters : undefined;
}

function gpTuplets(allowThirteen: boolean): readonly Tuplet[] {
  return GTP_TUPLETS.filter(({ enters }) => enters !== GP5_ONLY_TUPLET || allowThirteen);
}

function isStorable(duration: Duration, allowThirteen: boolean): boolean {
  const { tuplet } = duration;
  const isNormal = tuplet.enters === NORMAL_TUPLET.enters && tuplet.times === NORMAL_TUPLET.times;
  const isSingle = duration.innerTuplet === undefined;
  return isSingle && !duration.doubleDotted && (isNormal || tupletDivisionToGp(tuplet, allowThirteen) !== undefined);
}

/** Durations GP3–GP5 can store, the tuplet `enters` ones first, then the plain ones, then the other tuplets. */
function storableDurations(enters: number, allowThirteen: boolean): readonly Duration[] {
  const tuplets = gpTuplets(allowThirteen);
  const ordered = [
    ...tuplets.filter((tuplet) => tuplet.enters === enters),
    NORMAL_TUPLET,
    ...tuplets.filter((tuplet) => tuplet.enters !== enters),
  ];
  return ordered.flatMap((tuplet) =>
    NOTE_VALUES.flatMap((value) => [false, true].map((dotted) => ({ value, dotted, doubleDotted: false, tuplet }))),
  );
}

/**
 * The duration to write: `duration` itself when GP3–GP5 can store it, else one of the same length
 * (5:2 eighths = 5:4 sixteenths, a 2:3 duplet = a dotted note, a triplet inside a triplet = a 9:8 tuplet),
 * else the nearest it has (a double dot becomes a dot, an unknown tuplet none, a tuplet inside a tuplet the
 * outer one) — which shifts the beats after it.
 */
export function writableDuration(duration: Duration, allowThirteen: boolean): Duration {
  if (isStorable(duration, allowThirteen)) {
    return duration;
  }
  const ticks = durationTicks(duration);
  const same = storableDurations(duration.tuplet.enters, allowThirteen).find((candidate) => durationTicks(candidate) === ticks);
  if (same !== undefined) {
    return same;
  }
  const tuplet = tupletDivisionToGp(duration.tuplet, allowThirteen) === undefined ? NORMAL_TUPLET : duration.tuplet;
  return { value: duration.value, dotted: duration.dotted || duration.doubleDotted, doubleDotted: false, tuplet };
}

/** The byte of the option whose note value is closest to `value` (note values are powers of two). */
function nearestCode(codes: readonly NoteValueCode[], value: number): number {
  const target = Math.log2(Math.max(value, 1));
  let best: NoteValueCode = codes[0] ?? [1, 0];
  for (const code of codes) {
    if (Math.abs(Math.log2(code[0]) - target) < Math.abs(Math.log2(best[0]) - target)) {
      best = code;
    }
  }
  return best[1];
}

/** Stroke speed as a note value → TuxGuitar's stroke byte (GP5OutputStream.toStrokeValue). */
export function strokeSpeedToGp(value: number): number {
  return nearestCode(STROKE_SPEED_CODES, value);
}

/** Trill period: 16th = 1, 32nd = 2, 64th = 3. */
export function trillPeriodToGp(value: number): number {
  return nearestCode(TRILL_PERIOD_CODES, value);
}

/** Tremolo picking speed: 8th = 1, 16th = 2, 32nd = 3. */
export function tremoloPickingSpeedToGp(value: number): number {
  return nearestCode(TREMOLO_PICKING_CODES, value);
}

export function graceTransitionToGp(transition: GraceTransition): number {
  return GRACE_TRANSITIONS.indexOf(transition);
}
