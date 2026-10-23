// Editing a bend or tremolo bar curve point by point, after the editors of TuxGuitar's TGBendDialog and
// TGTremoloBarDialog (checkPoint, removePointsAtXLine, orderPoints; LGPL-2.1): a point snaps to the grid of positions
// 0…12 and quarter tones, and a position holds one point. Not in TuxGuitar: moving a point keeps it between its neighbours.
import { BEND_MAX_POSITION, BEND_MAX_VALUE, TREMOLO_BAR_LIMIT } from '../formats/common/bend-units';
import type { Bend, BendPoint } from '../model/song';

/** The note effects drawn as a curve of points: positions 0…12 across the note, values in quarter tones. */
export type CurveEffect = 'bend' | 'tremoloBar';

/** The values a curve's points keep to, in quarter tones. */
export interface CurveValueRange {
  readonly min: number;
  readonly max: number;
}

/** A bend goes up to three tones (TGEffectBend.MAX_VALUE_LENGTH); the tremolo bar an octave either way. */
export const CURVE_VALUE_RANGES: Readonly<Record<CurveEffect, CurveValueRange>> = {
  bend: { min: 0, max: BEND_MAX_VALUE },
  tremoloBar: { min: -TREMOLO_BAR_LIMIT, max: TREMOLO_BAR_LIMIT },
};

/** Rounded into min…max, without negative zero. */
function clampRound(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value))) + 0;
}

/** The point on the grid: position rounded into 0…12, value into the range; undefined when either is not a finite number. */
function toGridPoint(point: BendPoint, range: CurveValueRange): BendPoint | undefined {
  if (!Number.isFinite(point.position) || !Number.isFinite(point.value)) {
    return undefined;
  }
  return { position: clampRound(point.position, 0, BEND_MAX_POSITION), value: clampRound(point.value, range.min, range.max) };
}

/** The points on the grid, sorted by position, one per position (the later one in the list wins); others left out. */
export function normalizeCurvePoints(points: readonly BendPoint[], range: CurveValueRange): readonly BendPoint[] {
  const byPosition = new Map<number, BendPoint>();
  for (const point of points) {
    const onGrid = toGridPoint(point, range);
    if (onGrid !== undefined) {
      byPosition.set(onGrid.position, onGrid);
    }
  }
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

/** The points with one more, snapped to the grid; it replaces the point already at its position. */
export function addCurvePoint(points: readonly BendPoint[], point: BendPoint, range: CurveValueRange): readonly BendPoint[] {
  return normalizeCurvePoints([...points, point], range);
}

/**
 * The points (as normalizeCurvePoints returns them) with the one at `index` moved to `to`, snapped to the grid and kept
 * between its neighbours, so the order and the point's index stay; a point with no room between them only changes its
 * value. The same points when the index is out of range or the point does not move.
 */
export function moveCurvePoint(points: readonly BendPoint[], index: number, to: BendPoint, range: CurveValueRange): readonly BendPoint[] {
  const current = points[index];
  const onGrid = toGridPoint(to, range);
  if (current === undefined || onGrid === undefined) {
    return points;
  }
  const lowest = (points[index - 1]?.position ?? -1) + 1;
  const highest = (points[index + 1]?.position ?? BEND_MAX_POSITION + 1) - 1;
  const position = lowest > highest ? current.position : Math.min(highest, Math.max(lowest, onGrid.position));
  if (position === current.position && onGrid.value === current.value) {
    return points;
  }
  return points.map((point, i) => (i === index ? { position, value: onGrid.value } : point));
}

/** The points without the one at `index`; the same points when there is none. */
export function removeCurvePoint(points: readonly BendPoint[], index: number): readonly BendPoint[] {
  return points[index] === undefined ? points : points.filter((_, i) => i !== index);
}

/** The points as a bend or tremolo bar curve; undefined (no effect) when there are none. */
export function curveFromPoints(points: readonly BendPoint[]): Bend | undefined {
  return points.length === 0 ? undefined : { points };
}
