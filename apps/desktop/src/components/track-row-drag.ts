import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { BAR_MAP } from '../score/bar-map';
import { DRAG_RETENTION } from './slider-drag';

/** How far (points) the pointer must move before a press on a track's name becomes a drag. */
const DRAG_THRESHOLD = 6;

export interface TrackRowDragCallbacks {
  /** A click (no drag): the track is shown. */
  readonly onSelect: (trackIndex: number) => void;
  /** While dragging, where the track would go; undefined when the drag ends. */
  readonly onDragOver?: (fromIndex: number, toIndex: number | undefined) => void;
  /** The drag ended on another place. */
  readonly onDrop?: (fromIndex: number, toIndex: number) => void;
}

interface DragStart {
  readonly pageY: number;
  readonly didDrag: boolean;
}

/** The place a drag from `trackIndex` points at: a row further per row height moved, within the table. */
export function dragTargetIndex(trackIndex: number, trackCount: number, deltaY: number): number {
  return Math.min(Math.max(0, trackIndex + Math.round(deltaY / BAR_MAP.rowHeight)), Math.max(0, trackCount - 1));
}

/**
 * A track name's press handlers: a click shows the track; a vertical drag moves it to the row it is dropped on (the
 * tracks panel draws where). Followed from where the mouse went down, in window points, as the score's rows do.
 */
export function useTrackRowDrag(trackIndex: number, trackCount: number, callbacks: TrackRowDragCallbacks) {
  const start = useRef<DragStart | undefined>(undefined);
  const deltaOf = (event: GestureResponderEvent): number => event.nativeEvent.pageY - (start.current?.pageY ?? event.nativeEvent.pageY);
  const isDraggable = callbacks.onDrop !== undefined && trackCount > 1;
  return {
    onPressIn: (event: GestureResponderEvent) => {
      start.current = { pageY: event.nativeEvent.pageY, didDrag: false };
    },
    onPressMove: (event: GestureResponderEvent) => {
      const current = start.current;
      if (current === undefined || !isDraggable) {
        return;
      }
      const deltaY = deltaOf(event);
      const didDrag = current.didDrag || Math.abs(deltaY) >= DRAG_THRESHOLD;
      start.current = { ...current, didDrag };
      if (didDrag) {
        callbacks.onDragOver?.(trackIndex, dragTargetIndex(trackIndex, trackCount, deltaY));
      }
    },
    onPressOut: (event: GestureResponderEvent) => {
      if (start.current?.didDrag !== true) {
        return;
      }
      callbacks.onDragOver?.(trackIndex, undefined);
      const toIndex = dragTargetIndex(trackIndex, trackCount, deltaOf(event));
      if (toIndex !== trackIndex) {
        callbacks.onDrop?.(trackIndex, toIndex);
      }
    },
    // After onPressOut or before it: a press that became a drag selects nothing.
    onPress: () => {
      if (start.current?.didDrag !== true) {
        callbacks.onSelect(trackIndex);
      }
    },
    pressRetentionOffset: DRAG_RETENTION,
  };
}
