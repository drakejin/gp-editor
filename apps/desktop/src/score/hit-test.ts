import { type BeatLayout, TAB } from '../lib/layout';
import type { RowGeometry } from './geometry';
import type { PlacedMeasure } from './row';

/** What a click in a row points at. `string` is set when the click was on the tab staff; `trackIndex` names the staff's track. */
export interface RowHit {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly string?: number;
  readonly trackIndex?: number;
}

/** A track's staff in one system, for a drag: its bars placed, its geometry, and where its system and it start (from the score's top). */
export interface DragRow {
  readonly placed: readonly PlacedMeasure[];
  readonly geometry: RowGeometry;
  readonly systemTop: number;
  readonly staffTop: number;
}

/**
 * The beat nearest to a click (within the measure under it; beat 0 of a bar without beats, where its rest is drawn) and,
 * on the tab staff, the nearest string.
 */
export function hitTestRow(placed: readonly PlacedMeasure[], geometry: RowGeometry, stringCount: number, x: number, y: number): RowHit | undefined {
  const measure = placed.find((m) => x >= m.x && x < m.x + m.layout.width) ?? (x < (placed[0]?.x ?? 0) ? placed[0] : undefined);
  if (measure === undefined) {
    return undefined;
  }
  const localX = x - measure.x;
  const nearest = measure.layout.beats.reduce<BeatLayout | undefined>((best, beat) => (best === undefined || Math.abs(beat.x - localX) < Math.abs(best.x - localX) ? beat : best), undefined);
  return { measureIndex: measure.layout.measureIndex, beatIndex: nearest?.beatIndex ?? 0, string: tabString(geometry, stringCount, y) };
}

/**
 * The beat under a drag that began in row `fromRow` of `rows`: `y` counts from that row's staff top and runs into the
 * systems below (or above, when negative) — a system reaches down to the next one's top —; past the first or last row
 * it stays on it, and beside a row on its ends. In a multitrack score `rows` are one track's staves: the drag stays on
 * that track.
 */
export function hitTestDrag(rows: readonly DragRow[], fromRow: number, stringCount: number, x: number, y: number): RowHit | undefined {
  const from = rows[fromRow];
  if (from === undefined) {
    return undefined;
  }
  const scoreY = from.staffTop + y;
  const rowIndex = Math.max(0, rows.findIndex((_, i) => scoreY < (rows[i + 1]?.systemTop ?? Infinity)));
  const row = rows[rowIndex];
  const first = row?.placed[0];
  const last = row?.placed.at(-1);
  if (row === undefined || first === undefined || last === undefined) {
    return undefined;
  }
  const inRowX = Math.min(last.x + last.layout.width - 1, Math.max(first.x, x));
  return hitTestRow(row.placed, row.geometry, stringCount, inRowX, scoreY - row.staffTop);
}

function tabString(geometry: RowGeometry, stringCount: number, y: number): number | undefined {
  if (geometry.tabTop === undefined) {
    return undefined;
  }
  const top = geometry.tabTop - TAB.stringGap / 2;
  const bottom = geometry.tabTop + (stringCount - 0.5) * TAB.stringGap;
  if (y < top || y > bottom) {
    return undefined;
  }
  return Math.min(stringCount, Math.max(1, Math.round((y - geometry.tabTop) / TAB.stringGap) + 1));
}
