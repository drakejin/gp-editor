import { TAB } from '../lib/layout';
import type { RowGeometry } from './geometry';
import type { PlacedMeasure } from './row';

/** What a click in a row points at. `string` is set when the click was on the tab staff. */
export interface RowHit {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly string?: number;
}

/** The beat nearest to a click (within the measure under it) and, on the tab staff, the nearest string. */
export function hitTestRow(placed: readonly PlacedMeasure[], geometry: RowGeometry, stringCount: number, x: number, y: number): RowHit | undefined {
  const measure = placed.find((m) => x >= m.x && x < m.x + m.layout.width) ?? (x < (placed[0]?.x ?? 0) ? placed[0] : undefined);
  if (measure === undefined || measure.layout.beats.length === 0) {
    return undefined;
  }
  const localX = x - measure.x;
  const nearest = measure.layout.beats.reduce((best, beat) => (Math.abs(beat.x - localX) < Math.abs(best.x - localX) ? beat : best));
  return { measureIndex: measure.layout.measureIndex, beatIndex: nearest.beatIndex, string: tabString(geometry, stringCount, y) };
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
