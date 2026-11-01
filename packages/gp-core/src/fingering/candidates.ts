// The ways one beat's notes can be played: each note on a string that keeps its pitch, no two on one string, a chord's
// fretted notes within MAX_FRET_SPAN frets (buildChordVoicings' rule), and what each way costs the hand.
import { MAX_FRET_SPAN } from '../chords/creator';
import { HAND_SPAN } from '../edit/string-placement';
import type { StringOption, Timeline, TimelineStep } from './timeline';

/**
 * What the search weighs, in hundredths of a fret of hand movement — whole numbers, so every sum is exact. The hand
 * moving and stretching costs most; open strings and low positions decide between fingerings that move the hand alike.
 */
export const FINGERING_COSTS = {
  /** The fretting hand moving one fret. */
  move: 100,
  /** Each fret a beat's notes reach past the hand's four (HAND_SPAN). */
  stretch: 150,
  /** A fretted note: an open string needs no finger. */
  fretted: 10,
  /** Each fret the beat's lowest fretted note sits above the first: low positions first. */
  position: 5,
  /** A note put on another string than it had, so nothing moves for nothing (left out of the cost reported). */
  restring: 1,
} as const;

/** One way to play a step. */
export interface Candidate {
  /** Option index (timeline note's `options`) per note of the step, in the step's order; all 0 = as it is. */
  readonly choice: readonly number[];
  /** What playing it costs, the hand's move aside; restrings included. */
  readonly local: number;
  /** Frets the index finger may sit at to play it: handLow…handHigh; 0–0 when every note is open (the hand stays). */
  readonly handLow: number;
  readonly handHigh: number;
}

/** What earlier steps leave for this one: strings a chain's notes must keep, by note id, and strings still sounding. */
export interface StepRules {
  readonly forced: ReadonlyMap<number, number>;
  readonly blocked: ReadonlySet<number>;
}

/** Ways one step's notes are tried at most before the best are kept, and how many are kept. */
const MAX_TRIED = 4096;
const MAX_KEPT = 24;

/** The candidate for a choice of options: its cost and the hand's room. */
export function toCandidate(choice: readonly number[], picked: readonly StringOption[]): Candidate {
  const restrung = choice.filter((index) => index !== 0).length;
  const fretted = picked.filter((option) => option.position > 0).map((option) => option.position);
  if (fretted.length === 0) {
    return { choice, local: restrung * FINGERING_COSTS.restring, handLow: 0, handHigh: 0 };
  }
  const low = Math.min(...fretted);
  const high = Math.max(...fretted);
  const stretch = Math.max(0, high - low - (HAND_SPAN - 1));
  const local =
    fretted.length * FINGERING_COSTS.fretted + (low - 1) * FINGERING_COSTS.position + stretch * FINGERING_COSTS.stretch + restrung * FINGERING_COSTS.restring;
  return { choice, local, handLow: stretch > 0 ? low : Math.max(1, high - (HAND_SPAN - 1)), handHigh: low };
}

/** The step as it is. */
export function currentCandidate(timeline: Timeline, step: TimelineStep): Candidate {
  const picked = step.noteIds.flatMap((id) => timeline.notes[id]?.options[0] ?? []);
  return toCandidate(step.noteIds.map(() => 0), picked);
}

type Allowed = readonly (readonly number[])[];

/** Each note's option indexes the rules leave. */
function allowedOptions(timeline: Timeline, step: TimelineStep, rules: StepRules): Allowed {
  return step.noteIds.map((id) => {
    const options = timeline.notes[id]?.options ?? [];
    const forced = rules.forced.get(id);
    return options.flatMap((option, index) => ((forced === undefined ? !rules.blocked.has(option.string) : option.string === forced) ? [index] : []));
  });
}

/** Every choice of allowed options on separate strings within the span, tried in order up to MAX_TRIED. */
function enumerate(timeline: Timeline, step: TimelineStep, allowed: Allowed): readonly Candidate[] {
  const order = allowed.map((_, i) => i).sort((a, b) => (allowed[a]?.length ?? 0) - (allowed[b]?.length ?? 0));
  const options = step.noteIds.map((id) => timeline.notes[id]?.options ?? []);
  const found: Candidate[] = [];
  const choice = step.noteIds.map(() => 0);
  const used = new Set<number>();
  const visit = (depth: number, low: number, high: number): void => {
    if (found.length >= MAX_TRIED) {
      return;
    }
    const noteIndex = order[depth];
    if (noteIndex === undefined) {
      found.push(toCandidate([...choice], choice.map((index, i) => options[i]?.[index] as StringOption)));
      return;
    }
    for (const index of allowed[noteIndex] ?? []) {
      const option = options[noteIndex]?.[index];
      const isFretted = option !== undefined && option.position > 0;
      const [nextLow, nextHigh] = isFretted ? [Math.min(low, option.position), Math.max(high, option.position)] : [low, high];
      if (option !== undefined && !used.has(option.string) && nextHigh - nextLow < MAX_FRET_SPAN) {
        used.add(option.string);
        choice[noteIndex] = index;
        visit(depth + 1, nextLow, nextHigh);
        used.delete(option.string);
      }
    }
  };
  visit(0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
  return found;
}

/** The cheapest way for each hand position first, then the cheapest others: at most MAX_KEPT (more when positions differ). */
function keepBest(candidates: readonly Candidate[]): readonly Candidate[] {
  const sorted = [...candidates].sort((a, b) => a.local - b.local);
  const byHand = new Map<number, Candidate>();
  sorted.forEach((candidate) => byHand.set(candidate.handHigh, byHand.get(candidate.handHigh) ?? candidate));
  const kept = new Set(byHand.values());
  for (const candidate of sorted) {
    if (kept.size >= MAX_KEPT) {
      break;
    }
    kept.add(candidate);
  }
  return [...kept];
}

/** True when the step as it is obeys the rules: its own strings neither blocked nor other than the ones forced. */
function isCurrentAllowed(allowed: Allowed): boolean {
  return allowed.every((indexes) => indexes.includes(0));
}

/**
 * The ways to play a step under the rules, best first per hand position: its notes on separate strings, the forced ones
 * where they must be, none on a blocked string, the fretted ones within MAX_FRET_SPAN frets. The step as it is is among
 * them whenever the rules allow it, even beyond the span.
 */
export function stepCandidates(timeline: Timeline, step: TimelineStep, rules: StepRules): readonly Candidate[] {
  const allowed = allowedOptions(timeline, step, rules);
  const kept = keepBest(enumerate(timeline, step, allowed));
  const isCurrentKept = kept.some((candidate) => candidate.choice.every((index) => index === 0));
  return isCurrentAllowed(allowed) && !isCurrentKept ? [...kept, currentCandidate(timeline, step)] : kept;
}
