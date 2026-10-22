import { NORMAL_TUPLET, NOTE_VALUES, durationTicks } from '../model/defaults';
import type { Duration, Tuplet } from '../model/song';

/** Plain and dotted durations of every note value in a tuplet, longest first. */
function fillCandidates(tuplet: Tuplet): readonly Duration[] {
  return NOTE_VALUES.flatMap((value) =>
    [false, true].map((dotted): Duration => ({ value, dotted, doubleDotted: false, tuplet })),
  ).sort((a, b) => durationTicks(b) - durationTicks(a));
}

const PLAIN_CANDIDATES = fillCandidates(NORMAL_TUPLET);

function candidatesFor(tuplet: Tuplet): readonly Duration[] {
  if (tuplet.enters === tuplet.times) {
    return PLAIN_CANDIDATES;
  }
  return [...PLAIN_CANDIDATES, ...fillCandidates(tuplet)].sort((a, b) => durationTicks(b) - durationTicks(a));
}

/**
 * Rest durations that add up to exactly `ticks`: `preferred` as many times as it fits (TuxGuitar's createSilences with a
 * preferred duration), then the longest plain or dotted values, also in `tuplet` (by default `preferred`'s). Undefined
 * when the time cannot be filled exactly.
 */
export function restDurations(
  ticks: number,
  preferred?: Duration,
  tuplet: Tuplet = preferred?.tuplet ?? NORMAL_TUPLET,
): readonly Duration[] | undefined {
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
  for (const candidate of candidatesFor(tuplet)) {
    const length = durationTicks(candidate);
    while (remaining >= length) {
      durations.push(candidate);
      remaining -= length;
    }
  }
  return remaining === 0 ? durations : undefined;
}
