import { useCallback, useRef } from 'react';
import type { RowLayout } from '../lib/layout';
import type { RowGeometry } from '../score/geometry';
import { type RowHit, hitTestDrag } from '../score/hit-test';
import { placeRow } from '../score/row';

interface DragSources {
  readonly rows: readonly RowLayout[];
  readonly headerWidth: number;
  readonly geometry: RowGeometry;
  readonly stringCount: number;
  readonly onPressBeat: (hit: RowHit, isExtending: boolean) => void;
  readonly onDragBeat: (hit: RowHit) => void;
}

export interface DragSelection {
  readonly onPressRow: (hit: RowHit, isExtending: boolean) => void;
  readonly onDragRow: (rowIndex: number, x: number, y: number) => void;
}

const isSameBeat = (a: RowHit | undefined, b: RowHit): boolean => a?.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex;

/**
 * Selecting beats with the mouse: a press places the cursor (or, with shift, grows the selection), and a drag selects up
 * to the beat under the pointer — in any row — once per beat it reaches. The handlers stay the same functions while the
 * score changes, so the rows are not redrawn for them.
 */
export function useDragSelection(sources: DragSources): DragSelection {
  const latest = useRef(sources);
  latest.current = sources;
  const lastBeat = useRef<RowHit | undefined>(undefined);

  const onPressRow = useCallback((hit: RowHit, isExtending: boolean) => {
    lastBeat.current = hit;
    latest.current.onPressBeat(hit, isExtending);
  }, []);

  const onDragRow = useCallback((rowIndex: number, x: number, y: number) => {
    const { rows, headerWidth, geometry, stringCount, onDragBeat } = latest.current;
    const placed = rows.map((row) => placeRow(row, headerWidth));
    const hit = hitTestDrag(placed, rowIndex, geometry, stringCount, x, y);
    if (hit === undefined || isSameBeat(lastBeat.current, hit)) {
      return;
    }
    lastBeat.current = hit;
    onDragBeat(hit);
  }, []);

  return { onPressRow, onDragRow };
}
