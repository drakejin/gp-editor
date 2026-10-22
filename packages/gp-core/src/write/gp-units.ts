// Inverses of the GP3–GP5 readers' unit conversions (TuxGuitar GP5OutputStream helpers, LGPL-2.1), so that write → read is lossless.
import { BEND_MAX_POSITION } from '../formats/common/bend-units';
import { MAX_VELOCITY } from '../formats/common/velocity';
import { durationTicks, NORMAL_TUPLET, NOTE_VALUES } from '../model/defaults';
import type { Duration, GraceTransition, NoteValue, Tuplet } from '../model/song';

/** GP3–GP5 bend and tremolo bar positions run 0…60 (shared.ts GP_BEND_POSITION). */
const GP_BEND_POSITION = 60;
/** GP bend and whammy values are 1/100 tones: 25 = a quarter tone (bend-units.ts GP_QUARTER_TONE). */
const GP_QUARTER_TONE = 25;
/** One GP dynamic step in velocity, and one channel-byte step in MIDI value. */
const DYNAMIC_STEP = 16;
const CHANNEL_STEP = 8;
const MAX_CHANNEL_BYTE = 16;
const MAX_DYNAMIC = 8;

/** Model position 0…12 → GP 0…60 (the reader rounds raw × 12 / 60). */
export function bendPositionToGp(position: number): number {
  return Math.round((position * GP_BEND_POSITION) / BEND_MAX_POSITION);
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

/** The tuplets Guitar Pro 3–5 store, by their "enters" number (shared.ts TUPLETS). */
const GP_TUPLET_TIMES: ReadonlyMap<number, number> = new Map([
  [3, 2],
  [5, 4],
  [6, 4],
  [7, 4],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
]);
const GP5_ONLY_TUPLET = 13;

/** The tuplet division to write; undefined for a normal duration or a tuplet Guitar Pro cannot store. */
export function tupletDivisionToGp(tuplet: Tuplet, allowThirteen: boolean): number | undefined {
  const times = GP_TUPLET_TIMES.get(tuplet.enters);
  const isAllowed = tuplet.enters !== GP5_ONLY_TUPLET || allowThirteen;
  return times === tuplet.times && isAllowed ? tuplet.enters : undefined;
}

function gpTuplets(allowThirteen: boolean): readonly Tuplet[] {
  return [...GP_TUPLET_TIMES]
    .filter(([enters]) => enters !== GP5_ONLY_TUPLET || allowThirteen)
    .map(([enters, times]) => ({ enters, times }));
}

function isStorable(duration: Duration, allowThirteen: boolean): boolean {
  const { tuplet } = duration;
  const isNormal = tuplet.enters === NORMAL_TUPLET.enters && tuplet.times === NORMAL_TUPLET.times;
  return !duration.doubleDotted && (isNormal || tupletDivisionToGp(tuplet, allowThirteen) !== undefined);
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
 * (5:2 eighths = 5:4 sixteenths, a 2:3 duplet = a dotted note), else the nearest it has (a double dot
 * becomes a dot, an unknown tuplet none) — which shifts the beats after it.
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
function nearestCode(codes: readonly (readonly [number, number])[], value: number): number {
  const target = Math.log2(Math.max(value, 1));
  let best = codes[0] ?? [0, 0];
  for (const code of codes) {
    if (Math.abs(Math.log2(code[0]) - target) < Math.abs(Math.log2(best[0]) - target)) {
      best = code;
    }
  }
  return best[1];
}

/** Stroke speed as a note value → TuxGuitar's stroke byte (GP5OutputStream.toStrokeValue). */
export function strokeSpeedToGp(value: number): number {
  return nearestCode([[64, 2], [32, 3], [16, 4], [8, 5], [4, 6]], value);
}

/** Trill period: 16th = 1, 32nd = 2, 64th = 3. */
export function trillPeriodToGp(value: number): number {
  return nearestCode([[16, 1], [32, 2], [64, 3]], value);
}

/** Tremolo picking speed: 8th = 1, 16th = 2, 32nd = 3. */
export function tremoloPickingSpeedToGp(value: number): number {
  return nearestCode([[8, 1], [16, 2], [32, 3]], value);
}

const GRACE_TRANSITION_CODES: Readonly<Record<GraceTransition, number>> = { none: 0, slide: 1, bend: 2, hammer: 3 };

export function graceTransitionToGp(transition: GraceTransition): number {
  return GRACE_TRANSITION_CODES[transition];
}
