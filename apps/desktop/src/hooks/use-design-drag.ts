import { useCallback, useMemo, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { type DesignDragStart, type DesignDragStep, type DesignGuide, designDragStep } from '../lib/design-drag';
import { type LayoutAction, applyLayoutAction } from '../state/layout-edits';

export interface DesignDrag {
  /** The song the score shows: while a handle is dragged, with the drag's edit applied (not yet an undo step). */
  readonly song: Song;
  /** The automatic guideline while the drag snaps to a beat or bar line of the system above or below. */
  readonly guide?: DesignGuide;
  /** A handle was pressed: the handle, its system, where, and the score as laid out then. */
  readonly onPress: (start: DesignDragStart) => void;
  /** The pointer moved, in the pressed canvas's points. */
  readonly onMove: (x: number, y: number) => void;
  /** The drag ended: its edit becomes one undo step. */
  readonly onRelease: () => void;
}

interface Drag {
  readonly start: DesignDragStart;
  readonly step: DesignDragStep;
}

/**
 * Design Mode's drags on the score: a beat, a bar line or a space follows the pointer on a preview of the song (the
 * edit applied to the shown song only, as the note panels' drafts are), and becomes one edit when the mouse is let go.
 */
export function useDesignDrag(song: Song, onEdit: ((action: LayoutAction) => void) | undefined): DesignDrag {
  const [drag, setDrag] = useState<Drag | undefined>(undefined);
  // The drag the release ends, without waiting for a render.
  const current = useRef<Drag | undefined>(undefined);
  const keep = useCallback((next: Drag | undefined) => {
    current.current = next;
    setDrag(next);
  }, []);
  const onPress = useCallback((start: DesignDragStart) => keep({ start, step: {} }), [keep]);
  const onMove = useCallback(
    (x: number, y: number) => {
      const dragged = current.current;
      if (dragged !== undefined) {
        keep({ ...dragged, step: designDragStep(dragged.start, x, y) });
      }
    },
    [keep],
  );
  const onRelease = useCallback(() => {
    const action = current.current?.step.action;
    keep(undefined);
    if (action !== undefined) {
      onEdit?.(action);
    }
  }, [keep, onEdit]);
  const action = drag?.step.action;
  const shown = useMemo(() => (drag === undefined || action === undefined ? song : applyLayoutAction(drag.start.song, action)), [drag, action, song]);
  return { song: shown, guide: drag?.step.guide, onPress, onMove, onRelease };
}
