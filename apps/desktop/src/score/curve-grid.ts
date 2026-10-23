import { type BendPoint, CURVE_VALUE_RANGES, type CurveValueRange } from '@gp-editor/core';
import { type CurveDraft, curveValueLabel } from '../lib/curve-draft';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';

/** The bend and tremolo bar panels' grid, in points: positions 0–12 across, quarter tones up. */
export const CURVE_GRID = {
  width: 472,
  height: 224,
  left: 40,
  top: 12,
  plotWidth: 420,
  plotHeight: 200,
  /** Positions run 0…12 across the note (TuxGuitar's units). */
  lastPosition: 12,
  /** Every third position (a quarter of the note) gets a solid line. */
  positionGroup: 3,
  dotRadius: 4,
  selectedRadius: 7.5,
  selectedStroke: 2,
  /** How near a press must be to a point to take it rather than add one. */
  hitRadius: 10,
  lineWidth: 2,
  gridWidth: 0.5,
  axisWidth: 1.2,
  dash: [2, 3],
  labelSize: 10,
  labelGap: 6,
} as const;

const QUARTERS_PER_TONE = 4;
/** The tremolo bar's grid shows three tones either way, the model's whole range when the curve goes further. */
const TREMOLO_VIEW_REACH = 12;
/** Rows closer than this are drawn every semitone only. */
const MIN_ROW_GAP = 6;

/** What the grid shows: a bend from the note to three tones up; the tremolo bar ±3 tones, or ±6 when the curve goes further. */
export function curveView(draft: CurveDraft): CurveValueRange {
  if (draft.effect === 'bend') {
    return CURVE_VALUE_RANGES.bend;
  }
  const reach = Math.max(0, ...draft.points.map((point) => Math.abs(point.value)));
  return reach > TREMOLO_VIEW_REACH ? CURVE_VALUE_RANGES.tremoloBar : { min: -TREMOLO_VIEW_REACH, max: TREMOLO_VIEW_REACH };
}

function yOf(value: number, view: CurveValueRange): number {
  return CURVE_GRID.top + ((view.max - value) / (view.max - view.min)) * CURVE_GRID.plotHeight;
}

function xOf(position: number): number {
  return CURVE_GRID.left + (position / CURVE_GRID.lastPosition) * CURVE_GRID.plotWidth;
}

export function curvePointXY(point: BendPoint, view: CurveValueRange): { readonly x: number; readonly y: number } {
  return { x: xOf(point.position), y: yOf(point.value, view) };
}

/** The canvas point (x, y) as a position and a value, not rounded, kept inside the grid. */
export function curvePointAt(x: number, y: number, view: CurveValueRange): BendPoint {
  const { left, top, plotWidth, plotHeight, lastPosition } = CURVE_GRID;
  const across = Math.min(1, Math.max(0, (x - left) / plotWidth));
  const down = Math.min(1, Math.max(0, (y - top) / plotHeight));
  return { position: across * lastPosition, value: view.max - down * (view.max - view.min) };
}

/** The index of the point nearest (x, y) within the hit radius; undefined when none is that near. */
export function hitTestCurvePoint(points: readonly BendPoint[], x: number, y: number, view: CurveValueRange): number | undefined {
  let nearest: { readonly index: number; readonly distance: number } | undefined;
  points.forEach((point, index) => {
    const at = curvePointXY(point, view);
    const distance = Math.hypot(at.x - x, at.y - y);
    if (distance <= CURVE_GRID.hitRadius && (nearest === undefined || distance < nearest.distance)) {
      nearest = { index, distance };
    }
  });
  return nearest?.index;
}

function columns(palette: Palette): DrawCommand[] {
  const { top, plotHeight, lastPosition, positionGroup, gridWidth, axisWidth, dash } = CURVE_GRID;
  return Array.from({ length: lastPosition + 1 }, (_, position): DrawCommand => {
    const x = xOf(position);
    const isGroup = position % positionGroup === 0;
    return { kind: 'line', x1: x, y1: top, x2: x, y2: top + plotHeight, width: isGroup ? axisWidth : gridWidth, color: palette.chromeRaised, ...(isGroup ? {} : { dash }) };
  });
}

/** A row per quarter tone (per semitone when they would crowd), solid at whole tones, the note's pitch brighter. */
function rows(view: CurveValueRange, palette: Palette): DrawCommand[] {
  const { left, plotWidth, plotHeight, gridWidth, axisWidth, dash } = CURVE_GRID;
  const span = view.max - view.min;
  const step = plotHeight / span < MIN_ROW_GAP ? 2 : 1;
  return Array.from({ length: Math.floor(span / step) + 1 }, (_, i): DrawCommand => {
    const value = view.max - i * step;
    const y = yOf(value, view);
    const isTone = value % QUARTERS_PER_TONE === 0;
    const color = value === 0 ? palette.chromeMuted : palette.chromeRaised;
    return { kind: 'line', x1: left, y1: y, x2: left + plotWidth, y2: y, width: isTone ? axisWidth : gridWidth, color, ...(isTone ? {} : { dash }) };
  });
}

function toneLabels(draft: CurveDraft, view: CurveValueRange, palette: Palette): DrawCommand[] {
  const tones = Math.floor((view.max - view.min) / QUARTERS_PER_TONE);
  return Array.from({ length: tones + 1 }, (_, i): DrawCommand => {
    const value = view.max - i * QUARTERS_PER_TONE;
    return {
      kind: 'text',
      x: CURVE_GRID.left - CURVE_GRID.labelGap,
      y: yOf(value, view),
      text: curveValueLabel(draft.effect, value),
      size: CURVE_GRID.labelSize,
      color: palette.chromeMuted,
      font: 'ui',
      align: 'right',
    };
  });
}

function curve(draft: CurveDraft, view: CurveValueRange, palette: Palette): DrawCommand[] {
  const points = draft.points.map((point) => curvePointXY(point, view));
  const segments = points.slice(1).map((point, i): DrawCommand => {
    const from = points[i] ?? point;
    return { kind: 'line', x1: from.x, y1: from.y, x2: point.x, y2: point.y, width: CURVE_GRID.lineWidth, color: palette.chromeAccent };
  });
  const dots = points.map((point): DrawCommand => ({ kind: 'circle', x: point.x, y: point.y, radius: CURVE_GRID.dotRadius, color: palette.chromeText }));
  const selected = draft.selectedIndex === undefined ? undefined : points[draft.selectedIndex];
  const ring: DrawCommand[] =
    selected === undefined ? [] : [{ kind: 'circle', x: selected.x, y: selected.y, radius: CURVE_GRID.selectedRadius, color: palette.chromeAccent, strokeWidth: CURVE_GRID.selectedStroke }];
  return [...segments, ...dots, ...ring];
}

/** The panel's grid: the plot, its rows and columns, the tone labels, and the draft's curve with its points. */
export function engraveCurveGrid(draft: CurveDraft, view: CurveValueRange, palette: Palette): DrawCommand[] {
  const { left, top, plotWidth, plotHeight } = CURVE_GRID;
  const plot: DrawCommand = { kind: 'rect', x: left, y: top, width: plotWidth, height: plotHeight, color: palette.chromeDeep };
  return [plot, ...columns(palette), ...rows(view, palette), ...toneLabels(draft, view, palette), ...curve(draft, view, palette)];
}
