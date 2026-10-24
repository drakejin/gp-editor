import { type BeamLink, type MeasureHeader, QUARTER_TIME, beamGroupBounds, effectiveBeamGrouping } from '@gp-editor/core';

export interface RhythmBeat {
  /** Centre of the beat in the measure. */
  readonly x: number;
  readonly start: number;
  /** Note value of the beat's rhythm voice: 1, 2, 4, 8 … 64. */
  readonly value: number;
  readonly isRest: boolean;
  /** The beam to the next beat, set by hand (broken, joined, or only the eighth beam). */
  readonly beamToNext?: BeamLink;
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

/**
 * Where the bar's beam groups start, in ticks from the bar start, then where the last one ends: the bar's own grouping
 * or the time signature's (per beat, per dotted quarter in 6/8, 9/8, 12/8).
 */
export function beamGroupBoundsOf(header: MeasureHeader): readonly number[] {
  return beamGroupBounds(effectiveBeamGrouping(header));
}

/** The group an offset from the bar start falls in; past the last group (an over-full bar) one group per quarter. */
function groupIndex(offset: number, bounds: readonly number[]): number {
  const end = bounds[bounds.length - 1] ?? 0;
  if (offset >= end) {
    return bounds.length - 1 + Math.floor((offset - end) / QUARTER_TIME);
  }
  return Math.max(0, bounds.findIndex((bound, i) => offset >= bound && offset < (bounds[i + 1] ?? end)));
}

/**
 * Beam eighth-and-shorter notes that fall in the same group; rests and longer notes break a beam, and a beat's own
 * beam to the next beat breaks it or joins it across a group boundary.
 */
export function layoutBeams(beats: readonly RhythmBeat[], measureStart: number, groupBounds: readonly number[]): BeamLayout {
  const groups = beamGroups(beats, measureStart, groupBounds);
  return {
    beamed: new Set(groups.flat()),
    beams: groups.flatMap((group) => groupBeams(group, beats)),
  };
}

function isBeamable(beat: RhythmBeat): boolean {
  return !beat.isRest && flagCount(beat.value) > 0;
}

/** Whether a beam goes on from `previous` to `beat` (two beamable beats in a row). */
function isLinked(previous: RhythmBeat, beat: RhythmBeat, measureStart: number, bounds: readonly number[]): boolean {
  if (previous.beamToNext === 'break' || previous.beamToNext === 'join') {
    return previous.beamToNext === 'join';
  }
  return groupIndex(previous.start - measureStart, bounds) === groupIndex(beat.start - measureStart, bounds);
}

function beamGroups(beats: readonly RhythmBeat[], measureStart: number, bounds: readonly number[]): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  beats.forEach((beat, index) => {
    const previous = beats[index - 1];
    const continues = current.length > 0 && previous !== undefined && isBeamable(beat) && isLinked(previous, beat, measureStart, bounds);
    if (!continues) {
      if (current.length >= 2) {
        groups.push(current);
      }
      current = [];
    }
    if (isBeamable(beat)) {
      current.push(index);
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

/**
 * Secondary beams: joined between neighbours that both reach `level` (unless the first breaks its secondary beams), a
 * stub where only one does.
 */
function levelBeams(group: readonly number[], beats: readonly RhythmBeat[], level: number): Beam[] {
  const reaches = (position: number) => flagCount(beats[group[position] ?? -1]?.value ?? 0) >= level;
  const isBroken = (position: number) => beats[group[position] ?? -1]?.beamToNext === 'breakSecondary';
  const isJoined = (position: number) => position + 1 < group.length && reaches(position) && reaches(position + 1) && !isBroken(position);
  const xAt = (position: number) => beats[group[position] ?? -1]?.x ?? 0;
  const beams: Beam[] = [];
  group.forEach((_, position) => {
    if (!reaches(position)) {
      return;
    }
    if (isJoined(position)) {
      beams.push({ level, fromX: xAt(position), toX: xAt(position + 1) });
    } else if (!(position > 0 && isJoined(position - 1))) {
      // A stub points into the group: on from its first beat, back from its last or from a secondary break.
      const towardsNext = position + 1 < group.length && (position === 0 || !isBroken(position));
      const x = xAt(position);
      beams.push({ level, fromX: towardsNext ? x : x - BEAM_STUB, toX: towardsNext ? x + BEAM_STUB : x });
    }
  });
  return beams;
}
