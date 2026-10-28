import { useCallback, useRef } from 'react';
import type { Song } from '@gp-editor/core';
import { type DragRow, type RowHit, hitTestDrag } from '../score/hit-test';
import { placeRow } from '../score/row';
import type { ScoreLayout } from '../score/score-layout';

interface DragSources {
  readonly song: Song;
  readonly layout: ScoreLayout;
  readonly onPressBeat: (hit: RowHit, isExtending: boolean) => void;
  readonly onDragBeat: (hit: RowHit) => void;
}

export interface DragSelection {
  readonly onPressRow: (hit: RowHit, isExtending: boolean) => void;
  /** A drag that began on a staff of `trackIndex` in system `rowIndex` moved to (x, y) from that staff's top left. */
  readonly onDragRow: (rowIndex: number, x: number, y: number, trackIndex: number) => void;
}

const isSameBeat = (a: RowHit | undefined, b: RowHit): boolean => a?.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex;

/**
 * Selecting beats with the mouse: a press places the cursor (or, with shift, grows the selection), and a drag selects up
 * to the beat under the pointer — in any row, on the track it began on — once per beat it reaches. The handlers stay
 * the same functions while the score changes, so the rows are not redrawn for them.
 */
export function useDragSelection(sources: DragSources): DragSelection {
  const latest = useRef(sources);
  latest.current = sources;
  const lastBeat = useRef<RowHit | undefined>(undefined);

  const onPressRow = useCallback((hit: RowHit, isExtending: boolean) => {
    lastBeat.current = hit;
    latest.current.onPressBeat(hit, isExtending);
  }, []);

  const onDragRow = useCallback((rowIndex: number, x: number, y: number, trackIndex: number) => {
    const { song, layout, onDragBeat } = latest.current;
    const staffIndex = Math.max(0, layout.staves.findIndex((staff) => staff.trackIndex === trackIndex));
    const staff = layout.staves[staffIndex];
    if (staff === undefined) {
      return;
    }
    // Each system's own staff: its geometry and its place on the page.
    const rows = layout.systems.map((system): DragRow => {
      const own = system.staves[staffIndex] ?? staff;
      const placed = placeRow(system.rows[staffIndex] ?? { measures: [] }, system.headerWidth);
      return { placed, geometry: own.geometry, systemTop: system.top, staffTop: system.top + own.top };
    });
    const stringCount = song.tracks[staff.trackIndex]?.strings.length ?? 6;
    const hit = hitTestDrag(rows, rowIndex, stringCount, x, y);
    if (hit === undefined || isSameBeat(lastBeat.current, hit)) {
      return;
    }
    lastBeat.current = hit;
    onDragBeat({ ...hit, trackIndex: staff.trackIndex });
  }, []);

  return { onPressRow, onDragRow };
}
