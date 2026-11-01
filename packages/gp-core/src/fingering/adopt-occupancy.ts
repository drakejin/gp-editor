// Which chains hold each string at each step, for checking Claude's positions: a chain holds its string from its first
// note's step to the last step its notes still sound over (a tie or legato pair, and every note on its own, is a chain).
// Kept per (step, string) cell, so a check or a move costs the chain's own steps, not the track's.
import type { Timeline } from './timeline';

/** The steps a chain holds its string over. */
export interface Hold {
  readonly first: number;
  readonly last: number;
}

/** A track's chains on its strings; changed in place by `moveHold` while Claude's answer is checked. */
export interface Occupancy {
  readonly holds: ReadonlyMap<number, Hold>;
  /** Chain ids by cell: `step * CELL_STRINGS + string`. */
  readonly cells: Map<number, number[]>;
}

/** More strings than any instrument has: one row of cells per step. */
const CELL_STRINGS = 32;

/** The last step that starts before `end` (at least `first`): steps are in time order. */
function lastStepBefore(timeline: Timeline, end: number, first: number): number {
  let low = first;
  let high = timeline.steps.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((timeline.steps[middle]?.start ?? Number.POSITIVE_INFINITY) < end) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function cellKey(step: number, string: number): number {
  return step * CELL_STRINGS + string;
}

function eachCell(occupancy: Occupancy, chain: number, string: number, visit: (key: number) => void): void {
  const hold = occupancy.holds.get(chain);
  for (let step = hold?.first ?? 0; hold !== undefined && step <= hold.last; step++) {
    visit(cellKey(step, string));
  }
}

function place(occupancy: Occupancy, chain: number, string: number): void {
  eachCell(occupancy, chain, string, (key) => {
    const holders = occupancy.cells.get(key);
    if (holders === undefined) {
      occupancy.cells.set(key, [chain]);
    } else if (!holders.includes(chain)) {
      holders.push(chain);
    }
  });
}

function lift(occupancy: Occupancy, chain: number, string: number): void {
  eachCell(occupancy, chain, string, (key) => {
    const holders = occupancy.cells.get(key);
    const at = holders?.indexOf(chain) ?? -1;
    if (holders !== undefined && at >= 0) {
      holders.splice(at, 1);
    }
  });
}

/** Every chain of the timeline on the string its notes are on now. */
export function buildOccupancy(timeline: Timeline, members: ReadonlyMap<number, readonly number[]>): Occupancy {
  const holds = new Map<number, Hold>();
  members.forEach((ids, chain) => {
    const notes = ids.flatMap((id) => timeline.notes[id] ?? []);
    const first = Math.min(...notes.map((note) => note.step));
    holds.set(chain, { first, last: lastStepBefore(timeline, Math.max(...notes.map((note) => note.end)), first) });
  });
  const occupancy: Occupancy = { holds, cells: new Map() };
  members.forEach((ids, chain) => place(occupancy, chain, timeline.notes[ids[0] ?? -1]?.string ?? 0));
  return occupancy;
}

/** The chain moved from one string to another. */
export function moveHold(occupancy: Occupancy, chain: number, from: number, to: number): void {
  lift(occupancy, chain, from);
  place(occupancy, chain, to);
}

/** True when no other chain holds `string` at any step this chain holds it. */
export function holdsAlone(occupancy: Occupancy, chain: number, string: number): boolean {
  const hold = occupancy.holds.get(chain);
  for (let step = hold?.first ?? 0; hold !== undefined && step <= hold.last; step++) {
    if ((occupancy.cells.get(cellKey(step, string)) ?? []).some((holder) => holder !== chain)) {
      return false;
    }
  }
  return true;
}
