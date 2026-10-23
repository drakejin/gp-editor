import { type DurationTuplets, NO_TUPLETS, NOTE_VALUES, durationTicks, withTuplets } from '../model/defaults';
import type { Duration } from '../model/song';

function byLength(a: Duration, b: Duration): number {
  return durationTicks(b) - durationTicks(a);
}

/** Plain and dotted durations of every note value in `tuplets`, longest first. */
function fillCandidates(tuplets: DurationTuplets): readonly Duration[] {
  return NOTE_VALUES.flatMap((value) => [false, true].map((dotted) => withTuplets({ value, dotted, doubleDotted: false }, tuplets))).sort(byLength);
}

const PLAIN_CANDIDATES = fillCandidates(NO_TUPLETS);

/** Plain values, those of the outer tuplet, and those of the tuplet inside it. */
function candidatesFor(tuplets: DurationTuplets): readonly Duration[] {
  const { tuplet, innerTuplet } = tuplets;
  if (tuplet.enters === tuplet.times) {
    return PLAIN_CANDIDATES;
  }
  const outer = fillCandidates({ tuplet });
  const inner = innerTuplet === undefined || innerTuplet.enters === innerTuplet.times ? [] : fillCandidates({ tuplet, innerTuplet });
  return [...PLAIN_CANDIDATES, ...outer, ...inner].sort(byLength);
}

/**
 * Rest durations that add up to exactly `ticks`: `preferred` as many times as it fits (TuxGuitar's createSilences with a
 * preferred duration), then the longest plain or dotted values, also in `tuplets`' tuplet and in the tuplet inside it
 * (by default `preferred`'s). Undefined when the time cannot be filled exactly.
 */
export function restDurations(ticks: number, preferred?: Duration, tuplets: DurationTuplets = preferred ?? NO_TUPLETS): readonly Duration[] | undefined {
  if (ticks <= 0) {
    return ticks === 0 ? [] : undefined;
  }
  const durations: Duration[] = [];
  let remaining = ticks;
  const preferredTicks = preferred === undefined ? 0 : durationTicks(preferred);
  while (preferred !== undefined && remaining >= preferredTicks) {
    durations.push(preferred);
    remaining -= preferredTicks;
  }
  for (const candidate of candidatesFor(tuplets)) {
    const length = durationTicks(candidate);
    while (remaining >= length) {
      durations.push(candidate);
      remaining -= length;
    }
  }
  return remaining === 0 ? durations : undefined;
}
