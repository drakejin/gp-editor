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

/** Where a track's staff sits in its system: from one system's staff to the next one's, and from the system's top. */
export interface StaffPlacement {
  readonly pitch: number;
  readonly top: number;
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
 * The beat under a drag that began in row `fromRow` of `rows`: `y` counts from that row's top and runs into the rows
 * below (or above, when negative); past the first or last row it stays on it, and beside a row on its ends. In a
 * multitrack score `rows` are one track's staves, `staff` where they sit in their systems: the drag stays on that track.
 */
export function hitTestDrag(
  rows: readonly (readonly PlacedMeasure[])[], fromRow: number, geometry: RowGeometry, stringCount: number, x: number, y: number,
  staff: StaffPlacement = { pitch: geometry.height, top: 0 },
): RowHit | undefined {
  const inSystem = y + staff.top;
  const rowIndex = Math.min(rows.length - 1, Math.max(0, fromRow + Math.floor(inSystem / staff.pitch)));
  const row = rows[rowIndex];
  const first = row?.[0];
  const last = row?.at(-1);
  if (row === undefined || first === undefined || last === undefined) {
    return undefined;
  }
  const inRowX = Math.min(last.x + last.layout.width - 1, Math.max(first.x, x));
  return hitTestRow(row, geometry, stringCount, inRowX, inSystem - (rowIndex - fromRow) * staff.pitch - staff.top);
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
