import type { BendPoint } from '@gp-editor/core';
import { bendLabel } from '../../lib/notation';
import type { DrawCommand } from '../draw';
import { arrowhead, dashedSpan, verticalArrow } from './shapes';

/** Bend arrows on the tab staff, as Guitar Pro draws them: up from the fret number to the amount, down for a release. */

export interface BendPlacement {
  /** Right edge of the fret number, where the arrow starts. */
  readonly startX: number;
  /** Where the note's time ends: the bend's points (positions 0 … 12) spread up to here. */
  readonly endX: number;
  /** The string line. */
  readonly baseY: number;
  /** Arrow tips of the lowest bend amount, above the staff. */
  readonly tipY: number;
  readonly color: string;
}

export const BEND = {
  /** Each higher amount of the same bend goes this much further up … */
  levelStep: 5,
  /** … but all of them stay within this height above the lowest. */
  maxStack: 10,
  /** With more amounts than this (custom bends), only the highest is labelled. */
  maxLabelledLevels: 2,
  labelSize: 8,
  /** From the arrow tip up to the centre of its label. */
  labelGap: 5,
  lineWidth: 1,
  arrowSize: 4,
  minWidth: 8,
  /** A release ends this far above the string, clear of the fret number. */
  releaseEnd: 4,
  /** A pre-bend arrow starts this far above the string. */
  preBendStart: 4,
  lastPosition: 12,
} as const;

interface BendGeometry extends BendPlacement {
  /** Distinct positive amounts, lowest first. */
  readonly levels: readonly number[];
  readonly levelStep: number;
}

function yOf(value: number, geometry: BendGeometry): number {
  return value <= 0
    ? geometry.baseY
    : geometry.tipY - geometry.levels.indexOf(value) * geometry.levelStep;
}

function xOf(position: number, geometry: BendGeometry): number {
  const ratio =
    Math.max(0, Math.min(BEND.lastPosition, position)) / BEND.lastPosition;
  return geometry.startX + (geometry.endX - geometry.startX) * ratio;
}

function label(
  value: number,
  x: number,
  tip: number,
  geometry: BendGeometry,
): DrawCommand[] {
  const { levels } = geometry;
  if (
    levels.length > BEND.maxLabelledLevels &&
    value !== levels[levels.length - 1]
  ) {
    return [];
  }
  return [
    {
      kind: 'text',
      x,
      y: tip - BEND.labelGap,
      text: bendLabel(value),
      size: BEND.labelSize,
      color: geometry.color,
      font: 'ui',
      align: 'center',
    },
  ];
}

/** A curve that leaves (xa, ya) level and turns into a vertical arrow ending at (xb, yb). */
function curvedArrow(
  xa: number,
  ya: number,
  xb: number,
  yb: number,
  color: string,
): DrawCommand[] {
  const isUp = yb < ya;
  const shaftEnd = isUp ? yb + BEND.arrowSize : yb - BEND.arrowSize;
  return [
    {
      kind: 'curve',
      x1: xa,
      y1: ya,
      cx: xb,
      cy: ya,
      x2: xb,
      y2: shaftEnd,
      width: BEND.lineWidth,
      color,
    },
    arrowhead(xb, yb, isUp ? 'up' : 'down', BEND.arrowSize, color),
  ];
}

function segment(
  from: BendPoint,
  to: BendPoint,
  geometry: BendGeometry,
): DrawCommand[] {
  const xa = xOf(from.position, geometry);
  const xb = xOf(to.position, geometry);
  const ya = yOf(from.value, geometry);
  const { color } = geometry;
  if (to.value > from.value) {
    const tip = yOf(to.value, geometry);
    return [
      ...curvedArrow(xa, ya, xb, tip, color),
      ...label(to.value, xb, tip, geometry),
    ];
  }
  if (to.value < from.value) {
    const end =
      to.value <= 0
        ? geometry.baseY - BEND.releaseEnd
        : yOf(to.value, geometry);
    return [
      ...curvedArrow(xa, ya, xb, end, color),
      ...(to.value > 0 ? label(to.value, xb, end, geometry) : []),
    ];
  }
  return to.value > 0 ? dashedSpan(xa, xb, ya, { color }) : [];
}

function preBend(value: number, geometry: BendGeometry): DrawCommand[] {
  const tip = yOf(value, geometry);
  return [
    ...verticalArrow(
      geometry.startX,
      geometry.baseY - BEND.preBendStart,
      tip,
      BEND.lineWidth,
      geometry.color,
    ),
    ...label(value, geometry.startX, tip, geometry),
  ];
}

/** Arrows, holds and amounts of a bend; nothing for a bend that never leaves the string. */
export function bendArrows(
  points: readonly BendPoint[],
  placement: BendPlacement,
): DrawCommand[] {
  const sorted = [...points].sort((a, b) => a.position - b.position);
  const first = sorted[0];
  if (first === undefined || sorted.every(point => point.value <= 0)) {
    return [];
  }
  const levels = [
    ...new Set(sorted.map(point => point.value).filter(value => value > 0)),
  ].sort((a, b) => a - b);
  const levelStep = Math.min(
    BEND.levelStep,
    BEND.maxStack / Math.max(1, levels.length - 1),
  );
  const geometry: BendGeometry = {
    ...placement,
    endX: Math.max(placement.endX, placement.startX + BEND.minWidth),
    levels,
    levelStep,
  };
  const start = first.value > 0 ? preBend(first.value, geometry) : [];
  return [
    ...start,
    ...sorted
      .slice(1)
      .flatMap((point, i) => segment(sorted[i] ?? point, point, geometry)),
  ];
}
