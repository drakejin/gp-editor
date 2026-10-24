import { BAR_DESIGN_LIMITS, STYLESHEET_LIMITS, type Song, stylesheetOf } from '@gp-editor/core';
import type { DesignHandle } from '../score/design-handles';
import { placeRow } from '../score/row';
import type { ScoreLayout } from '../score/score-layout';
import type { LayoutAction } from '../state/layout-edits';

/** A Design Mode drag as it started: the handle, its system, the pointer, and the score as it was laid out then. */
export interface DesignDragStart {
  readonly handle: DesignHandle;
  readonly systemIndex: number;
  /** Where the press was, on the handle's canvas (layout points). */
  readonly pointerX: number;
  readonly pointerY: number;
  readonly song: Song;
  readonly layout: ScoreLayout;
  /** The systems' width (layout points): a system as wide is stretched, its bars sharing the width. */
  readonly rowWidth: number;
}

/** The automatic guideline: an x every canvas of the systems named draws, where the drag snapped. */
export interface DesignGuide {
  readonly x: number;
  readonly systemIndexes: readonly number[];
}

/** What the drag would do now: the edit, and the guideline when it snapped. */
export interface DesignDragStep {
  readonly action?: LayoutAction;
  readonly guide?: DesignGuide;
}

/** How near (points) a dragged beat or bar line snaps to its match in the system above or below. */
export const SNAP_DISTANCE = 6;
/** The least room left between two beats, and the narrowest a bar is dragged. */
const MIN_BEAT_GAP = 6;
const MIN_BAR_WIDTH = 24;

/** The bars of a system's top staff, placed on its canvas (x from the canvas's left, past the names and clefs). */
function placedBars(layout: ScoreLayout, systemIndex: number) {
  const system = layout.systems[systemIndex];
  const row = system?.rows[0];
  return system === undefined || row === undefined ? [] : placeRow(row, system.headerWidth);
}

/** The places the drag can snap to in the systems above and below: their beats, or their bar lines. */
function snapTargets(layout: ScoreLayout, systemIndex: number, kind: 'beat' | 'barline'): (readonly [number, number])[] {
  return [systemIndex - 1, systemIndex + 1].flatMap((other) =>
    placedBars(layout, other).flatMap((measure, index, all) => {
      if (kind === 'barline') {
        return index === all.length - 1 ? [] : [[measure.x + measure.layout.width, other] as const];
      }
      return measure.layout.beats.map((beat) => [measure.x + beat.x, other] as const);
    }),
  );
}

/** `x` snapped to the nearest target within SNAP_DISTANCE, with the guideline through both systems. */
function snapped(x: number, targets: readonly (readonly [number, number])[], systemIndex: number): { readonly x: number; readonly guide?: DesignGuide } {
  const nearest = targets.reduce<readonly [number, number] | undefined>((best, target) => (best === undefined || Math.abs(target[0] - x) < Math.abs(best[0] - x) ? target : best), undefined);
  if (nearest === undefined || Math.abs(nearest[0] - x) > SNAP_DISTANCE) {
    return { x };
  }
  return { x: nearest[0], guide: { x: nearest[0], systemIndexes: [systemIndex, nearest[1]] } };
}

const roundTo = (value: number, decimals: number): number => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** A beat dragged to `pointerX`: its new offset, kept between its neighbours, snapped to a beat above or below. */
function beatStep(start: DesignDragStart, handle: Extract<DesignHandle, { kind: 'beat' }>, pointerX: number): DesignDragStep {
  const measure = placedBars(start.layout, start.systemIndex).find((each) => each.layout.measureIndex === handle.measureIndex);
  if (measure === undefined) {
    return {};
  }
  const others = measure.layout.beats.map((beat) => measure.x + beat.x).filter((x) => Math.abs(x - handle.x) > 0.01);
  const low = Math.max(measure.x, ...others.filter((x) => x < handle.x)) + MIN_BEAT_GAP;
  const high = Math.min(measure.x + measure.layout.width, ...others.filter((x) => x > handle.x)) - MIN_BEAT_GAP;
  const target = snapped(handle.x + pointerX - start.pointerX, snapTargets(start.layout, start.systemIndex, 'beat'), start.systemIndex);
  const x = Math.min(high, Math.max(low, target.x));
  const current = start.song.measureHeaders[handle.measureIndex]?.design?.beatOffsets?.find((offset) => offset.at === handle.at)?.offset ?? 0;
  const offset = roundTo(Math.min(BAR_DESIGN_LIMITS.beatOffset.max, Math.max(BAR_DESIGN_LIMITS.beatOffset.min, current + x - handle.x)), 1);
  return { action: { type: 'setBeatOffset', measureIndex: handle.measureIndex, at: handle.at, offset }, guide: x === target.x ? target.guide : undefined };
}

/**
 * A bar line dragged to `pointerX`: the bar left of it as wide as its right edge lands there, snapped to a bar line
 * above or below. In a stretched system the other bars share what is left (the width the bar needs for that is
 * solved from their shares: (A + x) / (A + x + B) of the system's width ends at the pointer).
 */
function barlineStep(start: DesignDragStart, handle: Extract<DesignHandle, { kind: 'barline' }>, pointerX: number): DesignDragStep {
  const bars = placedBars(start.layout, start.systemIndex);
  const index = bars.findIndex((each) => each.layout.measureIndex === handle.measureIndex);
  const bar = bars[index];
  const system = start.layout.systems[start.systemIndex];
  if (bar === undefined || system === undefined) {
    return {};
  }
  const widths = bars.map((each) => each.layout.width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const before = widths.slice(0, index).reduce((sum, width) => sum + width, 0);
  const after = total - before - bar.layout.width;
  const target = snapped(handle.x + pointerX - start.pointerX, snapTargets(start.layout, start.systemIndex, 'barline'), start.systemIndex);
  const isStretched = Math.abs(total - (start.rowWidth - system.headerWidth)) < 0.5;
  const edge = Math.min(total - MIN_BAR_WIDTH * (bars.length - index - 1), Math.max(before + MIN_BAR_WIDTH, target.x - system.headerWidth));
  const width = isStretched ? (edge * after) / Math.max(1, total - edge) - before : edge - before;
  const scale = start.song.measureHeaders[handle.measureIndex]?.design?.widthScale ?? 1;
  const widthScale = roundTo(Math.min(BAR_DESIGN_LIMITS.widthScale.max, Math.max(BAR_DESIGN_LIMITS.widthScale.min, (scale * width) / bar.layout.width)), 2);
  return { action: { type: 'setBarWidthScale', measureIndex: handle.measureIndex, widthScale }, guide: edge === target.x - system.headerWidth ? target.guide : undefined };
}

/** A space dragged up or down by the pointer: the stylesheet's spacing, in whole points within its range. */
function spacingStep(start: DesignDragStart, handle: Extract<DesignHandle, { kind: 'spacing' }>, pointerY: number): DesignDragStep {
  const sheet = stylesheetOf(start.song);
  const range = STYLESHEET_LIMITS[handle.spacing];
  const value = Math.round(Math.min(range.max, Math.max(range.min, sheet.systems[handle.spacing] + pointerY - start.pointerY)));
  return { action: { type: 'setStylesheet', stylesheet: { ...sheet, systems: { ...sheet.systems, [handle.spacing]: value } } } };
}

/** What a Design Mode drag does with the pointer at (`pointerX`, `pointerY`) on the canvas where it started. */
export function designDragStep(start: DesignDragStart, pointerX: number, pointerY: number): DesignDragStep {
  const { handle } = start;
  switch (handle.kind) {
    case 'beat':
      return beatStep(start, handle, pointerX);
    case 'barline':
      return barlineStep(start, handle, pointerX);
    case 'spacing':
      return spacingStep(start, handle, pointerY);
  }
}
