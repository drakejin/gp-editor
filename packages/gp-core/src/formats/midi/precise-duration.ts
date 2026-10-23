// Port of TuxGuitar app.tuxguitar.song.models.TGDuration (LGPL-2.1): precise durations, counted without rounding for any tuplet.
import { NORMAL_TUPLET, NOTE_VALUES, TUPLET_SIZES, tupletOf } from '../../model/defaults';
import { type Duration, type NoteValue, QUARTER_TIME, type Tuplet } from '../../model/song';

/** TGDuration.SHORTEST: a 64th. */
export const SHORTEST_VALUE: NoteValue = 64;

/**
 * TGDivisionType.DIVISION_TYPES: the model's tuplets plus 13:8. 13:8 only sizes the precise unit (as in TuxGuitar);
 * times read from ticks are multiples of 13, so the splitting never produces it.
 */
export const DIVISION_TYPES: readonly Tuplet[] = [
  NORMAL_TUPLET,
  ...TUPLET_SIZES.flatMap((size) => tupletOf(size) ?? []),
  { enters: 13, times: 8 },
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** Room for a dotted and a double-dotted shortest duration in the unit. */
const DOT_FACTOR = 4;

/** TGDuration.WHOLE_PRECISE_DURATION: a whole note, divisible by every division and dot (11 531 520). */
export const WHOLE_PRECISE_DURATION = DIVISION_TYPES.reduce<number>((whole, division) => lcm(whole, division.enters), SHORTEST_VALUE) * DOT_FACTOR;

/** Precise units per tick: a whole note is QUARTER_TIME * 4 ticks. */
export const PRECISE_PER_TICK = WHOLE_PRECISE_DURATION / (QUARTER_TIME * 4);

/** TGDuration.toPreciseTime: ticks → precise units (exact: a tick is a whole number of units). */
export function toPreciseTime(ticks: number): number {
  return ticks * PRECISE_PER_TICK;
}

/** TGDuration.getPreciseTime, with Java's integer division at each step. */
export function preciseTimeOf(duration: Duration): number {
  let precise = Math.trunc(WHOLE_PRECISE_DURATION / duration.value);
  if (duration.dotted) {
    precise = Math.trunc((precise * 3) / 2);
  } else if (duration.doubleDotted) {
    precise = Math.trunc((precise * 7) / 4);
  }
  return Math.trunc((precise * duration.tuplet.times) / duration.tuplet.enters);
}

/**
 * TGDuration.createDurationMap: every duration TuxGuitar supports by precise time. Several durations last as long (a
 * dotted triplet quarter and a quarter); the first listed wins: plain before dotted before double-dotted, divisions in
 * DIVISION_TYPES order.
 */
function buildDurationMap(): ReadonlyMap<number, Duration> {
  const map = new Map<number, Duration>();
  const dots = [
    { dotted: false, doubleDotted: false },
    { dotted: true, doubleDotted: false },
    { dotted: false, doubleDotted: true },
  ];
  for (const tuplet of DIVISION_TYPES) {
    for (const dot of dots) {
      for (const value of NOTE_VALUES) {
        const duration: Duration = { value, ...dot, tuplet };
        const key = preciseTimeOf(duration);
        if (!map.has(key)) {
          map.set(key, duration);
        }
      }
    }
  }
  return map;
}

const DURATION_MAP = buildDurationMap();

/**
 * Every supported duration, shortest first. TuxGuitar walks its duration map (a java.util.HashMap) in hash order, so
 * which of two equally good durations wins depends on that order; the port walks from shortest to longest, so a tie
 * goes to the shorter one, TuxGuitar's own rule of thumb ("better a bit too short than too long": a longer one would
 * swallow the next note).
 */
export const SUPPORTED_DURATIONS: readonly Duration[] = [...DURATION_MAP.entries()].sort(([a], [b]) => a - b).map(([, duration]) => duration);

/** The divisions TGDuration's splitting tries: prime ones only (6:4 is 3:2), most notes per tuplet first. */
export const SPLIT_DIVISIONS: readonly Tuplet[] = DIVISION_TYPES.filter((division) => gcd(division.enters, division.times) === 1).sort(
  (a, b) => b.enters - a.enters,
);

/** TGDuration.setPreciseValue: the duration lasting exactly `precise` units; undefined when none does. */
export function durationFromPrecise(precise: number): Duration | undefined {
  return DURATION_MAP.get(precise);
}

/** durationFromPrecise for a time the splitting built from supported durations; TuxGuitar throws when none lasts it. */
export function requireDuration(precise: number): Duration {
  const duration = DURATION_MAP.get(precise);
  if (duration === undefined) {
    throw new Error(`No duration lasts ${precise} precise units`);
  }
  return duration;
}

/** True when the duration is not plain: dotted or in a tuplet (TGDuration.moreComplexThan against no duration). */
export function isComplex(duration: Duration): boolean {
  return duration.dotted || duration.doubleDotted || duration.tuplet.enters !== 1 || duration.tuplet.times !== 1;
}
