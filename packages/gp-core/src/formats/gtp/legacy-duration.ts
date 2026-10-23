// Port of TuxGuitar app.tuxguitar.song.models.TGDuration precise-time helpers (LGPL-2.1), used by the GP1/GP2 reader.
import { GpFormatError } from '../../errors';
import { NORMAL_TUPLET, NOTE_VALUES } from '../../model/defaults';
import { type Duration, QUARTER_TIME, type TimeSignature, type Tuplet } from '../../model/song';

const DIVISION_TYPES: readonly Tuplet[] = [
  [1, 1],
  [3, 2],
  [5, 4],
  [6, 4],
  [7, 4],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
].map(([enters = 1, times = 1]) => (enters === 1 ? NORMAL_TUPLET : { enters, times }));

const SHORTEST = 64;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** TGDuration.WHOLE_PRECISE_DURATION: lcm of 64 and every tuplet's enters, times 4 (= 11531520). */
const WHOLE_PRECISE = DIVISION_TYPES.reduce((whole, { enters }) => (whole * enters) / gcd(whole, enters), SHORTEST) * 4;

/** Ticks per precise unit (45): QUARTER_TIME is a multiple of the precise quarter, so both convert exactly. */
export const TICKS_PER_PRECISE = (QUARTER_TIME * 4) / WHOLE_PRECISE;

/** Tuplets with coprime enters/times, most enters first (TGDuration.divisionTypes). */
const SPLIT_DIVISIONS: readonly Tuplet[] = DIVISION_TYPES.filter(({ enters, times }) => gcd(enters, times) === 1)
  .slice()
  .sort((a, b) => b.enters - a.enters);

/** TGDuration.getPreciseTime. */
export function preciseTime(duration: Duration): number {
  const plain = Math.floor(WHOLE_PRECISE / duration.value);
  const dotted = duration.dotted
    ? Math.floor((plain * 3) / 2)
    : duration.doubleDotted
      ? Math.floor((plain * 7) / 4)
      : plain;
  return Math.floor((dotted * duration.tuplet.times) / duration.tuplet.enters);
}

export function wholePreciseLength(timeSignature: TimeSignature): number {
  return Math.floor((timeSignature.numerator * WHOLE_PRECISE) / timeSignature.denominator);
}

/** TGDuration.durationMap: first duration for each precise time (plain, then dotted, then double dotted). */
const DURATION_BY_PRECISE_TIME: ReadonlyMap<number, Duration> = new Map(
  DIVISION_TYPES.flatMap((tuplet) =>
    [
      [false, false],
      [true, false],
      [false, true],
    ].flatMap(([dotted = false, doubleDotted = false]) =>
      NOTE_VALUES.map((value): Duration => ({ value, dotted, doubleDotted, tuplet })),
    ),
  )
    .reverse()
    .map((duration) => [preciseTime(duration), duration] as const),
);

/** No dot, dotted (a multiple of 3 halves) and double dotted (a multiple of 7 quarters). */
const SUB_DIVISIONS = [
  { divisor: 1, factor: 1, dotted: false, doubleDotted: false },
  { divisor: 2, factor: 3, dotted: true, doubleDotted: false },
  { divisor: 4, factor: 7, dotted: false, doubleDotted: true },
] as const;

interface SplitPart {
  readonly durations: readonly Duration[];
  readonly handled: number;
}

/**
 * TGDuration.splitPreciseDuration(timeToSplit, max, factory): rest durations that add up
 * to `total`, or undefined when no exact split exists.
 */
export function splitPreciseDuration(total: number, maxLength: number): readonly Duration[] | undefined {
  if (total === 0) {
    return [];
  }
  const max = Math.min(maxLength, WHOLE_PRECISE);
  let maxBase = WHOLE_PRECISE;
  while (max < maxBase) {
    maxBase = Math.floor(maxBase / 2);
  }
  let remaining = total;
  const durations: Duration[] = [];
  for (const division of SPLIT_DIVISIONS) {
    if (division.enters !== 1 && remaining % division.enters === 0) {
      continue;
    }
    const part = splitDivision(remaining, division, max, maxBase);
    if (part !== undefined) {
      durations.push(...part.durations);
      remaining -= part.handled;
    }
  }
  return remaining === 0 ? durations : undefined;
}

function splitDivision(total: number, division: Tuplet, max: number, maxBase: number): SplitPart | undefined {
  for (const sub of SUB_DIVISIONS) {
    const base = Math.floor(Math.floor((WHOLE_PRECISE * division.times) / (division.enters * SHORTEST)) / sub.divisor);
    if (base > maxBase) {
      return undefined;
    }
    const toSubtract = amountToSubtract(total, base, division.enters);
    if (toSubtract % base !== 0 || toSubtract > total) {
      continue;
    }
    let count = toSubtract / base;
    let multiple = 1;
    while (count !== 0 && count % 2 === 0 && multiple * 2 * base <= max) {
      multiple *= 2;
      count /= 2;
    }
    if (count % sub.factor === 0) {
      const unit = durationForPreciseTime(multiple * base * sub.divisor);
      const duration: Duration = { ...unit, dotted: sub.dotted, doubleDotted: sub.doubleDotted };
      const durations = Array.from({ length: count / sub.factor }, () => duration);
      return { durations, handled: durations.length * preciseTime(duration) };
    }
  }
  return undefined;
}

function amountToSubtract(total: number, base: number, enters: number): number {
  const units = total / base;
  const isPowerOfTwo = total % base === 0 && Number.isInteger(Math.log2(units === 0 ? 1 : units));
  if (enters === 1 || isPowerOfTwo) {
    return total;
  }
  let toSubtract = base;
  while ((total - toSubtract) % enters !== 0 && toSubtract <= total) {
    toSubtract += base;
  }
  return toSubtract;
}

/** TGDuration.setPreciseValue, which throws for a precise time no duration has. */
function durationForPreciseTime(time: number): Duration {
  const duration = DURATION_BY_PRECISE_TIME.get(time);
  if (duration === undefined) {
    throw new GpFormatError(`No duration lasts ${time} / ${WHOLE_PRECISE} of a whole note`);
  }
  return duration;
}
