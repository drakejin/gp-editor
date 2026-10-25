import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import type { RowGeometry } from './geometry';
import { stringY } from './tab';

/** A beat of the shown track. */
export interface BeatPosition {
  readonly measureIndex: number;
  readonly beatIndex: number;
}

/** Selected beats of the shown track, from `first` to `last` inclusive (first never after last). */
export interface BeatRange {
  readonly first: BeatPosition;
  readonly last: BeatPosition;
}

/** Above the top staff line and below the bottom one. */
const MARGIN = 10;
/** Beyond the first and last selected beat of a bar when the selection ends there. */
const EDGE = 12;
/** Five notation lines, 8 points apart. */
const NOTATION_HEIGHT = 32;
/** A light tint over the selected beats (hex alpha). */
const TINT_ALPHA = '26';

/**
 * The part of `range` inside the bars `firstMeasureIndex`…`lastMeasureIndex` (a row); undefined when it has none. A
 * range running on past the row is cut at the row's ends, so a row redraws only when its own selected beats change.
 */
export function clipRange(range: BeatRange | undefined, firstMeasureIndex: number, lastMeasureIndex: number): BeatRange | undefined {
  if (range === undefined || range.last.measureIndex < firstMeasureIndex || range.first.measureIndex > lastMeasureIndex) {
    return undefined;
  }
  const first = range.first.measureIndex < firstMeasureIndex ? { measureIndex: firstMeasureIndex, beatIndex: 0 } : range.first;
  const last = range.last.measureIndex > lastMeasureIndex ? { measureIndex: lastMeasureIndex, beatIndex: Number.MAX_SAFE_INTEGER } : range.last;
  return { first, last };
}

export function isSameRange(a: BeatRange | undefined, b: BeatRange | undefined): boolean {
  return (
    a?.first.measureIndex === b?.first.measureIndex && a?.first.beatIndex === b?.first.beatIndex &&
    a?.last.measureIndex === b?.last.measureIndex && a?.last.beatIndex === b?.last.beatIndex
  );
}

/** Top and bottom of the staves a row shows, with a margin. */
function staffSpan(geometry: RowGeometry, stringCount: number): { readonly top: number; readonly bottom: number } | undefined {
  const top = geometry.notationTop ?? geometry.tabTop;
  if (top === undefined) {
    return undefined;
  }
  const bottom = geometry.tabTop !== undefined ? stringY(geometry.tabTop, stringCount) : top + NOTATION_HEIGHT;
  return { top: top - MARGIN, bottom: bottom + MARGIN };
}

/** The selected beats' x span in a measure: from bar line to bar line where the selection goes on past it. */
function selectedSpan(range: BeatRange, layout: MeasureLayout): { readonly left: number; readonly right: number } | undefined {
  const { measureIndex, beats } = layout;
  if (beats.length === 0) {
    // A bar without beats (the track rests there) is selected whole.
    return measureIndex < range.first.measureIndex || measureIndex > range.last.measureIndex ? undefined : { left: 0, right: layout.width };
  }
  const from = measureIndex === range.first.measureIndex ? range.first.beatIndex : 0;
  const to = measureIndex === range.last.measureIndex ? range.last.beatIndex : Number.MAX_SAFE_INTEGER;
  const selected = beats.filter((beat) => beat.beatIndex >= from && beat.beatIndex <= to);
  const firstBeat = selected[0];
  const lastBeat = selected[selected.length - 1];
  if (measureIndex < range.first.measureIndex || measureIndex > range.last.measureIndex || firstBeat === undefined || lastBeat === undefined) {
    return undefined;
  }
  const before = beats[beats.indexOf(firstBeat) - 1];
  const after = beats[beats.indexOf(lastBeat) + 1];
  const left = before !== undefined ? (before.x + firstBeat.x) / 2 : measureIndex > range.first.measureIndex ? 0 : firstBeat.x - EDGE;
  const right = after !== undefined ? (lastBeat.x + after.x) / 2 : measureIndex < range.last.measureIndex ? layout.width : lastBeat.x + EDGE;
  return { left, right };
}

/** A light tint over the measure's selected beats, across the staves (drawn over the notes, which show through). */
export function engraveSelection(range: BeatRange | undefined, layout: MeasureLayout, geometry: RowGeometry, stringCount: number, palette: Palette): DrawCommand[] {
  const span = range === undefined ? undefined : selectedSpan(range, layout);
  const staff = staffSpan(geometry, stringCount);
  if (span === undefined || staff === undefined) {
    return [];
  }
  const color = `${palette.accent}${TINT_ALPHA}`;
  return [{ kind: 'rect', x: span.left, y: staff.top, width: span.right - span.left, height: staff.bottom - staff.top, color }];
}
