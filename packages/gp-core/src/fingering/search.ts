// The easy-fingering search: a dynamic programme over a timeline's steps. A state is where the index finger sits (0 =
// not placed yet) and which strings earlier notes still hold — a chain's string until its last note, a note's string
// while it sounds —; each step's candidates move the hand to a fret their notes can be reached from. Moving is a
// distance transform over the frets, so a step costs about frets + candidates × reach, not frets × candidates.
import { type Candidate, FINGERING_COSTS, type StepRules, currentCandidate, stepCandidates } from './candidates';
import type { Timeline, TimelineStep } from './timeline';

/** What a fingering costs: what the search minimises (in frets of hand movement), and the frets the hand travels. */
export interface FingeringCost {
  readonly total: number;
  readonly handTravel: number;
}

/** The fingering found: an option index per note id the search covered (0 = as it is), its cost, the notes restrung. */
export interface FingeringPath {
  readonly choices: ReadonlyMap<number, number>;
  readonly cost: FingeringCost;
  readonly restrung: number;
}

/** Evaluate the fingering as it is, or search for the cheapest. */
export type SearchMode = 'evaluate' | 'optimize';

/** A string an earlier note holds: its chain's until the chain's last step, the note's own until its sound ends. */
interface Reservation {
  readonly string: number;
  readonly chain: number;
  readonly untilStep: number;
  readonly untilTick: number;
}

interface SearchState {
  readonly cost: number;
  /** The part of `cost` the reported cost leaves out (restrings, kept conflicts). */
  readonly hidden: number;
  readonly hand: number;
  readonly reservations: readonly Reservation[];
  readonly reservationKey: string;
  readonly parent?: SearchState;
  readonly choice?: readonly number[];
}

/** States kept after each step: more than a track's frets times the few strings held at once. */
const MAX_STATES = 400;
const COST_UNIT = 100;

function reservationKey(reservations: readonly Reservation[]): string {
  return reservations.map((r) => `${r.string}:${r.chain}:${r.untilStep}:${r.untilTick}`).join(',');
}

/** The strings a step's chains must keep and the strings other notes still hold. */
function rulesFor(reservations: readonly Reservation[], timeline: Timeline, step: TimelineStep, stepIndex: number): StepRules {
  const forced = new Map<number, number>();
  const blocked = new Set<number>();
  const chainsHere = new Map(step.noteIds.map((id) => [timeline.notes[id]?.chain ?? id, id]));
  for (const reservation of reservations) {
    const member = chainsHere.get(reservation.chain);
    if (member !== undefined && reservation.untilStep >= stepIndex) {
      forced.set(member, reservation.string);
    } else if (member === undefined && (reservation.untilStep >= stepIndex || reservation.untilTick > step.start)) {
      blocked.add(reservation.string);
    }
  }
  return { forced, blocked };
}

function rulesKey(rules: StepRules): string {
  return `${[...rules.forced].map(([id, string]) => `${id}=${string}`).join(',')}/${[...rules.blocked].sort((a, b) => a - b).join(',')}`;
}

/** The reservations after a step played as `candidate`: those still holding a string at the next step, and the step's own. */
function advance(reservations: readonly Reservation[], timeline: Timeline, stepIndex: number, candidate: Candidate): readonly Reservation[] {
  const step = timeline.steps[stepIndex] as TimelineStep;
  const nextStart = timeline.steps[stepIndex + 1]?.start ?? Number.POSITIVE_INFINITY;
  const isLive = (r: Reservation) => r.untilStep > stepIndex || r.untilTick > nextStart;
  const chainsHere = new Set(step.noteIds.map((id) => timeline.notes[id]?.chain ?? id));
  const kept = reservations.filter((r) => isLive(r) && !chainsHere.has(r.chain));
  const added = step.noteIds.flatMap((id, i): Reservation[] => {
    const note = timeline.notes[id];
    const option = note?.options[candidate.choice[i] ?? 0];
    if (note === undefined || option === undefined) {
      return [];
    }
    const chainEnd = timeline.chainEnds.get(note.chain) ?? stepIndex;
    const reservation = { string: option.string, chain: note.chain, untilStep: chainEnd > stepIndex ? chainEnd : -1, untilTick: note.end };
    return isLive(reservation) ? [reservation] : [];
  });
  return [...kept, ...added].sort((a, b) => a.string - b.string || a.chain - b.chain);
}

/** The cheapest way to have the hand at each fret before a step: from any state's fret, one move cost per fret. */
function moveTable(states: readonly SearchState[], frets: number): { readonly cost: readonly number[]; readonly from: readonly (SearchState | undefined)[] } {
  const cost: number[] = Array.from({ length: frets + 1 }, () => Number.POSITIVE_INFINITY);
  const from: (SearchState | undefined)[] = Array.from({ length: frets + 1 }, () => undefined);
  let unplaced: SearchState | undefined;
  for (const state of states) {
    if (state.hand === 0) {
      unplaced = unplaced === undefined || state.cost < unplaced.cost ? state : unplaced;
    } else if (state.cost < (cost[state.hand] ?? Number.POSITIVE_INFINITY)) {
      cost[state.hand] = state.cost;
      from[state.hand] = state;
    }
  }
  const relax = (fret: number, neighbour: number) => {
    const through = (cost[neighbour] ?? Number.POSITIVE_INFINITY) + FINGERING_COSTS.move;
    if (through < (cost[fret] ?? Number.POSITIVE_INFINITY)) {
      cost[fret] = through;
      from[fret] = from[neighbour];
    }
  };
  for (let fret = 2; fret <= frets; fret++) relax(fret, fret - 1);
  for (let fret = frets - 1; fret >= 1; fret--) relax(fret, fret + 1);
  for (let fret = 1; fret <= frets && unplaced !== undefined; fret++) {
    if (unplaced.cost < (cost[fret] ?? Number.POSITIVE_INFINITY)) {
      cost[fret] = unplaced.cost;
      from[fret] = unplaced;
    }
  }
  return { cost, from };
}

interface StepContext {
  readonly timeline: Timeline;
  readonly stepIndex: number;
  readonly mode: SearchMode;
  /** In `evaluate`: the fingering to cost, by note id (else the notes as they are). */
  readonly chosen?: ReadonlyMap<number, number>;
  readonly frets: number;
  readonly candidates: Map<string, readonly Candidate[]>;
  readonly next: Map<string, SearchState>;
}

function offer(next: Map<string, SearchState>, state: SearchState): void {
  const key = `${state.hand}|${state.reservationKey}`;
  const known = next.get(key);
  if (known === undefined || state.cost < known.cost) {
    next.set(key, state);
  }
}

function candidatesFor(context: StepContext, reservations: readonly Reservation[]): readonly Candidate[] {
  const step = context.timeline.steps[context.stepIndex] as TimelineStep;
  if (context.mode === 'evaluate') {
    return [currentCandidate(context.timeline, step, context.chosen)];
  }
  const rules = rulesFor(reservations, context.timeline, step, context.stepIndex);
  const key = rulesKey(rules);
  const known = context.candidates.get(key) ?? stepCandidates(context.timeline, step, rules);
  context.candidates.set(key, known);
  return known;
}

/** One group of states (same reservations) through a step: each candidate from each state, the hand moved where needed. */
function playGroup(context: StepContext, group: readonly SearchState[]): void {
  const reservations = group[0]?.reservations ?? [];
  const table = moveTable(group, context.frets);
  for (const candidate of candidatesFor(context, reservations)) {
    const after = context.mode === 'evaluate' ? [] : advance(reservations, context.timeline, context.stepIndex, candidate);
    const base = { reservations: after, reservationKey: reservationKey(after), choice: candidate.choice };
    if (candidate.handHigh === 0) {
      group.forEach((state) => offer(context.next, { ...base, cost: state.cost + candidate.local, hidden: state.hidden + candidate.hidden, hand: state.hand, parent: state }));
      continue;
    }
    for (let hand = candidate.handLow; hand <= candidate.handHigh; hand++) {
      const from = table.from[hand];
      if (from !== undefined) {
        offer(context.next, { ...base, cost: (table.cost[hand] ?? 0) + candidate.local, hidden: from.hidden + candidate.hidden, hand, parent: from });
      }
    }
  }
}

function groupStates(states: readonly SearchState[]): readonly (readonly SearchState[])[] {
  const groups = new Map<string, SearchState[]>();
  states.forEach((state) => groups.set(state.reservationKey, [...(groups.get(state.reservationKey) ?? []), state]));
  return [...groups.values()];
}

/** Strings notes before the searched steps still hold when it starts (those notes stay where they are). */
function initialReservations(timeline: Timeline): readonly Reservation[] {
  const start = timeline.steps[timeline.first]?.start ?? 0;
  const held = timeline.notes.filter((note) => note.step < timeline.first && ((timeline.chainEnds.get(note.chain) ?? note.step) >= timeline.first || note.end > start));
  return held.map((note) => ({ string: note.string, chain: note.chain, untilStep: timeline.chainEnds.get(note.chain) ?? -1, untilTick: note.end })).sort((a, b) => a.string - b.string || a.chain - b.chain);
}

/** The path a final state took, back to the start: each step's choice and the hand's fret there. */
function pathOf(timeline: Timeline, best: SearchState): FingeringPath {
  const backwards: SearchState[] = [];
  for (let state: SearchState | undefined = best; state?.choice !== undefined; state = state.parent) {
    backwards.push(state);
  }
  const states = backwards.reverse();
  const choices = new Map<number, number>();
  states.forEach((state, offset) => timeline.steps[timeline.first + offset]?.noteIds.forEach((id, i) => choices.set(id, state.choice?.[i] ?? 0)));
  const restrung = [...choices.values()].filter((index) => index !== 0).length;
  let handTravel = 0;
  states.forEach((state, offset) => {
    const previous = states[offset - 1]?.hand ?? 0;
    handTravel += previous > 0 && state.hand > 0 ? Math.abs(state.hand - previous) : 0;
  });
  return { choices, restrung, cost: { total: (best.cost - best.hidden) / COST_UNIT, handTravel } };
}

/** The frets the hand may sit at: the neck, or further when a note already sits beyond it. */
function fretRoom(timeline: Timeline): number {
  return timeline.notes.reduce((most, note) => note.options.reduce((top, option) => Math.max(top, option.position), most), Math.max(1, timeline.neck));
}

/**
 * The cheapest fingering of the timeline's searched steps (`optimize`), or what the fingering as it is costs
 * (`evaluate`; with `chosen`, the fingering it names); undefined when no way through obeys the rules (the track then stays
 * as it is). The cost is the
 * FINGERING_COSTS sum over the steps without its hidden terms (restrings, kept conflicts), in frets of hand movement.
 */
export function searchFingering(timeline: Timeline, mode: SearchMode, chosen?: ReadonlyMap<number, number>): FingeringPath | undefined {
  if (timeline.first > timeline.last) {
    return { choices: new Map(), restrung: 0, cost: { total: 0, handTravel: 0 } };
  }
  const frets = fretRoom(timeline);
  const reservations = mode === 'evaluate' ? [] : initialReservations(timeline);
  let states: readonly SearchState[] = [{ cost: 0, hidden: 0, hand: 0, reservations, reservationKey: reservationKey(reservations) }];
  for (let stepIndex = timeline.first; stepIndex <= timeline.last && states.length > 0; stepIndex++) {
    const context: StepContext = { timeline, stepIndex, mode, frets, candidates: new Map(), next: new Map(), ...(chosen === undefined ? {} : { chosen }) };
    groupStates(states).forEach((group) => playGroup(context, group));
    const next = [...context.next.values()];
    states = next.length > MAX_STATES ? next.sort((a, b) => a.cost - b.cost).slice(0, MAX_STATES) : next;
  }
  const best = states.reduce<SearchState | undefined>((found, state) => (found === undefined || state.cost < found.cost ? state : found), undefined);
  return best === undefined ? undefined : pathOf(timeline, best);
}
