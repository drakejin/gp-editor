import { QUARTER_TIME } from '@gp-editor/core';

export interface RhythmBeat {
  /** Centre of the beat in the measure. */
  readonly x: number;
  readonly start: number;
  /** Note value of the beat's rhythm voice: 1, 2, 4, 8 … 64. */
  readonly value: number;
  readonly isRest: boolean;
}

export interface Beam {
  /** 1 = eighth beam, 2 = sixteenth, … */
  readonly level: number;
  readonly fromX: number;
  readonly toX: number;
}

export interface BeamLayout {
  /** Indexes of beats drawn with a beam instead of flags. */
  readonly beamed: ReadonlySet<number>;
  readonly beams: readonly Beam[];
}

/** Length of a partial beam on a beat that has no neighbour at its level. */
export const BEAM_STUB = 6;

export function flagCount(value: number): number {
  return Math.max(0, Math.log2(value) - 2);
}

/** Beats are grouped per quarter note, or per dotted quarter in compound time (6/8, 9/8, 12/8). */
export function beamGroupTicks(numerator: number, denominator: number): number {
  return denominator === 8 && numerator % 3 === 0 ? (QUARTER_TIME * 3) / 2 : QUARTER_TIME;
}

/** Beam eighth-and-shorter notes that fall in the same group; rests and longer notes break a beam. */
export function layoutBeams(beats: readonly RhythmBeat[], measureStart: number, groupTicks: number): BeamLayout {
  const groups = beamGroups(beats, measureStart, groupTicks);
  return {
    beamed: new Set(groups.flat()),
    beams: groups.flatMap((group) => groupBeams(group, beats)),
  };
}

function beamGroups(beats: readonly RhythmBeat[], measureStart: number, groupTicks: number): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  let currentGroup = -1;
  beats.forEach((beat, index) => {
    const group = Math.floor((beat.start - measureStart) / groupTicks);
    const beamable = !beat.isRest && flagCount(beat.value) > 0;
    if (!beamable || group !== currentGroup) {
      if (current.length >= 2) {
        groups.push(current);
      }
      current = [];
    }
    if (beamable) {
      current.push(index);
      currentGroup = group;
    }
  });
  if (current.length >= 2) {
    groups.push(current);
  }
  return groups;
}

function groupBeams(group: readonly number[], beats: readonly RhythmBeat[]): Beam[] {
  const first = beats[group[0] ?? -1];
  const last = beats[group[group.length - 1] ?? -1];
  if (first === undefined || last === undefined) {
    return [];
  }
  const maxLevel = Math.max(...group.map((index) => flagCount(beats[index]?.value ?? 0)));
  const beams: Beam[] = [{ level: 1, fromX: first.x, toX: last.x }];
  for (let level = 2; level <= maxLevel; level++) {
    beams.push(...levelBeams(group, beats, level));
  }
  return beams;
}

/** Secondary beams: joined between neighbours that both reach `level`, a stub where only one does. */
function levelBeams(group: readonly number[], beats: readonly RhythmBeat[], level: number): Beam[] {
  const reaches = (position: number) => flagCount(beats[group[position] ?? -1]?.value ?? 0) >= level;
  const xAt = (position: number) => beats[group[position] ?? -1]?.x ?? 0;
  const beams: Beam[] = [];
  group.forEach((_, position) => {
    if (!reaches(position)) {
      return;
    }
    if (position + 1 < group.length && reaches(position + 1)) {
      beams.push({ level, fromX: xAt(position), toX: xAt(position + 1) });
    } else if (!(position > 0 && reaches(position - 1))) {
      const towardsNext = position + 1 < group.length;
      const x = xAt(position);
      beams.push({ level, fromX: towardsNext ? x : x - BEAM_STUB, toX: towardsNext ? x + BEAM_STUB : x });
    }
  });
  return beams;
}
