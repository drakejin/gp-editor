// Port of TuxGuitar app.tuxguitar.song.models.TGDuration (LGPL-2.1): splitPreciseDuration(Approximately), the MIDI import's quantisation.
import type { Duration, NoteValue, Tuplet } from '../../model/song';
import {
  SHORTEST_VALUE,
  SPLIT_DIVISIONS,
  SUPPORTED_DURATIONS,
  WHOLE_PRECISE_DURATION as WHOLE,
  isComplex,
  preciseTimeOf,
  requireDuration,
} from './precise-duration';

export interface SplitLimits {
  /** Shortest duration allowed, as a note value (MidiSettings' maxDurationValue). Default: a 64th. */
  readonly maxDurationValue?: NoteValue;
  /** Most notes per tuplet allowed: 1 = no tuplets, 3 = triplets, 5 = quintuplets too. Default: any. */
  readonly maxDivision?: number;
}

/** The longest power-of-two fraction of a whole note that is no longer than `max`. */
function maxPowerOfTwoBase(max: number): number {
  let maxBase = WHOLE;
  while (max < maxBase && maxBase > 1) {
    maxBase = Math.trunc(maxBase / 2);
  }
  return maxBase;
}

/** No dot, dotted (3 halves of a base), double-dotted (7 quarters of a base), by sub-division of the shortest duration. */
const DOTS: ReadonlyMap<number, { readonly factor: number; readonly dotted: boolean; readonly doubleDotted: boolean }> = new Map([
  [1, { factor: 1, dotted: false, doubleDotted: false }],
  [2, { factor: 3, dotted: true, doubleDotted: false }],
  [4, { factor: 7, dotted: false, doubleDotted: true }],
]);

/** How much of `remaining` to fill with this division: all of it, or enough bases to leave a time without the division. */
function timeToSubtract(remaining: number, division: Tuplet, enters: number, base: number): number {
  const isPowerOfTwo = remaining % base === 0 && ((remaining / base) & (remaining / base - 1)) === 0;
  if (division.enters === 1 || isPowerOfTwo) {
    return remaining;
  }
  let toSubtract = base;
  while ((remaining - toSubtract) % enters !== 0 && toSubtract <= remaining) {
    toSubtract += base;
  }
  return toSubtract;
}

/** Equal durations of one division and dot filling part of `remaining` from `base` units; undefined when they cannot. */
function splitWithBase(remaining: number, division: Tuplet, enters: number, base: number, subDivision: number, max: number): Duration[] | undefined {
  const toSubtract = timeToSubtract(remaining, division, enters, base);
  const dots = DOTS.get(subDivision);
  if (toSubtract % base !== 0 || toSubtract > remaining || dots === undefined) {
    return undefined;
  }
  let count = toSubtract / base;
  let multiple = 1;
  // merge powers of 2
  while (count !== 0 && count % 2 === 0 && multiple * 2 * base <= max) {
    multiple *= 2;
    count /= 2;
  }
  if (count % dots.factor !== 0) {
    return undefined;
  }
  const plain = requireDuration(multiple * base * subDivision);
  const duration: Duration = { ...plain, dotted: dots.dotted, doubleDotted: dots.doubleDotted };
  return Array.from({ length: count / dots.factor }, () => duration);
}

/** The number a time must divide by to hold none of the division (9 is not a prime: below 9:8, triplets are ninths). */
function divisibilityOf(division: Tuplet, limits: SplitLimits): number {
  return limits.maxDivision !== undefined && limits.maxDivision < 9 && division.enters === 3 ? 9 : division.enters;
}

/** One division's part of splitPreciseDuration: plain, then dotted, then double-dotted bases. */
function splitDivision(remaining: number, division: Tuplet, max: number, limits: SplitLimits): Duration[] | undefined {
  const enters = divisibilityOf(division, limits);
  const shortest = limits.maxDurationValue ?? SHORTEST_VALUE;
  for (let subDivision = 1; subDivision <= 4; subDivision *= 2) {
    const base = Math.trunc(Math.trunc((WHOLE * division.times) / (division.enters * shortest)) / subDivision);
    if (base > maxPowerOfTwoBase(max) || (limits.maxDurationValue !== undefined && subDivision !== 1)) {
      return undefined;
    }
    const durations = splitWithBase(remaining, division, enters, base, subDivision, max);
    if (durations !== undefined) {
      return durations;
    }
  }
  return undefined;
}

/** True when the time holds some of the division (it does not divide evenly) and the limits allow it; always for plain. */
function isTriedDivision(remaining: number, division: Tuplet, limits: SplitLimits): boolean {
  const isAllowed = limits.maxDivision === undefined || division.enters <= limits.maxDivision;
  return division.enters === 1 || (remaining % divisibilityOf(division, limits) !== 0 && isAllowed);
}

/**
 * TGDuration.splitPreciseDuration: durations adding up to exactly `timeToSplit`, none longer than `maxTime` (nor a
 * whole), the same duration for each division, the divisions with most notes per tuplet first; undefined when no such
 * list exists within the limits.
 */
export function splitPreciseDuration(timeToSplit: number, maxTime: number, limits: SplitLimits = {}): Duration[] | undefined {
  const durations: Duration[] = [];
  let remaining = timeToSplit;
  if (remaining === 0) {
    return durations;
  }
  const max = Math.min(maxTime, WHOLE);
  for (const division of SPLIT_DIVISIONS) {
    const found = isTriedDivision(remaining, division, limits) ? splitDivision(remaining, division, max, limits) : undefined;
    for (const duration of found ?? []) {
      durations.push(duration);
      remaining -= preciseTimeOf(duration);
    }
  }
  return remaining === 0 ? durations : undefined;
}

/** TGDuration.moreComplexThan: > 0 when `duration` is more complex than `other` (double dot, more notes per tuplet, dot). */
function moreComplexThan(duration: Duration, other: Duration | undefined): number {
  if (other === undefined) {
    return isComplex(duration) ? 1 : 0;
  }
  if (duration.doubleDotted && !other.doubleDotted) {
    return 1;
  }
  if (duration.tuplet.enters !== other.tuplet.enters) {
    return duration.tuplet.enters > other.tuplet.enters ? 1 : -1;
  }
  return duration.dotted && !other.dotted ? 1 : 0;
}

/** The single duration within one shortest duration of `time` (least complex, then closest); [] when nothing is closer than 0. */
function closestSingleDuration(time: number, limits: Required<SplitLimits>): Duration[] | undefined {
  const shortest = limits.maxDurationValue;
  const isZeroAcceptable = time <= Math.trunc(WHOLE / shortest);
  let best: Duration | undefined;
  let bestError = isZeroAcceptable ? time : -1;
  for (const candidate of SUPPORTED_DURATIONS) {
    const { enters, times } = candidate.tuplet;
    if (candidate.value > shortest || enters > limits.maxDivision || candidate.doubleDotted) {
      continue;
    }
    const maxError = Math.trunc(Math.trunc((WHOLE * times) / shortest) / enters);
    const error = Math.abs(preciseTimeOf(candidate) - time);
    const complexity = moreComplexThan(candidate, best);
    if (error <= maxError && (bestError < 0 || complexity < 0 || (complexity === 0 && error < bestError))) {
      best = candidate;
      bestError = error;
    }
  }
  if (best !== undefined) {
    return [best];
  }
  return isZeroAcceptable ? [] : undefined;
}

/** Java's Math.round((float) a / (float) b). */
function roundFloatRatio(a: number, b: number): number {
  return Math.floor(Math.fround(Math.fround(a) / Math.fround(b)) + 0.5);
}

/** One division's nearest list: the shortest duration rounded into `time`, powers of two merged, longest first. */
function combinationOf(time: number, division: Tuplet, shortestBase: number, max: number): Duration[] {
  const durations: Duration[] = [];
  let base = shortestBase;
  // a -1 offset: Math.round(1.5) is 2, and better a bit too short than too long
  let count = roundFloatRatio(time - 1, base);
  while (count > 0) {
    if (2 * base > max) {
      durations.push(...Array.from({ length: count }, () => requireDuration(base)));
      count = 0;
    } else if (count % 2 !== 0) {
      durations.push(requireDuration(base));
      count -= 1;
    } else {
      count /= 2;
      base *= 2;
    }
  }
  return durations.reverse();
}

/** The allowed division whose rounded combination comes closest to `time` (the last one on a tie). */
function closestCombination(time: number, maxTime: number, limits: Required<SplitLimits>): Duration[] {
  const max = Math.min(maxTime, WHOLE);
  const maxBase = maxPowerOfTwoBase(max);
  let approximate: Duration[] = [];
  let bestError = 0;
  for (const division of SPLIT_DIVISIONS) {
    if (division.enters > limits.maxDivision) {
      continue;
    }
    const base = Math.trunc((WHOLE * division.times) / (division.enters * limits.maxDurationValue));
    if (base > maxBase) {
      break;
    }
    const durations = combinationOf(time, division, base, max);
    const error = Math.abs(time - durations.reduce((total, duration) => total + preciseTimeOf(duration), 0));
    if (approximate.length === 0 || error <= bestError) {
      approximate = durations;
      bestError = error;
    }
  }
  return approximate;
}

/**
 * TGDuration.splitPreciseDurationApproximately: the exact split when it is short and uses one division, else the
 * nearest single duration (within one shortest duration), else the nearest combination. A time of zero or less gives
 * no duration.
 */
export function splitPreciseDurationApproximately(timeToSplit: number, maxTime: number, limits: Required<SplitLimits>): Duration[] {
  if (timeToSplit <= 0) {
    return [];
  }
  const exact = splitPreciseDuration(timeToSplit, maxTime, limits);
  const approximate = closestSingleDuration(timeToSplit, limits) ?? closestCombination(timeToSplit, maxTime, limits);
  const first = exact?.[0];
  if (exact === undefined || first === undefined) {
    return approximate;
  }
  const isHeterogeneous = exact.some((duration) => duration.tuplet.enters !== first.tuplet.enters || duration.tuplet.times !== first.tuplet.times);
  return isHeterogeneous || approximate.length < exact.length ? approximate : exact;
}
