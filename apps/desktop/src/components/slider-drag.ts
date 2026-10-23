import { useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

interface DragStart {
  readonly x: number;
  readonly pageX: number;
}

/** How far the pointer may leave a slider while dragging and still drive it. */
export const DRAG_RETENTION = { top: 400, bottom: 400, left: 2000, right: 2000 } as const;

export interface SliderDragCallbacks {
  /** Once, when a drag (or click) ends on a new value. */
  readonly onChange: (value: number) => void;
  /** On every move while dragging (e.g. to hear the value at once). */
  readonly onDrag?: (value: number) => void;
  /** When a drag ends back on the value it started from (nothing to change). */
  readonly onDragEnd?: () => void;
}

/**
 * The value while dragging (undefined otherwise) and the press handlers that drive a horizontal slider: `valueAt` turns
 * a pointer x (in the slider) into a value. A Pressable's press events, not a plain view's responder:
 * react-native-macos delivers mouse clicks to pressables. The pointer is followed from where it went down, so a drag
 * beyond the slider keeps tracking.
 */
export function useSliderDrag(value: number, valueAt: (x: number) => number, callbacks: SliderDragCallbacks) {
  const [dragValue, setDragValue] = useState<number | undefined>(undefined);
  const start = useRef<DragStart | undefined>(undefined);
  const valueOf = (event: GestureResponderEvent): number => {
    const origin = start.current;
    const x = origin === undefined ? event.nativeEvent.locationX : origin.x + event.nativeEvent.pageX - origin.pageX;
    return valueAt(x);
  };
  const show = (next: number) => {
    setDragValue(next);
    callbacks.onDrag?.(next);
  };
  const handlers = {
    onPressIn: (event: GestureResponderEvent) => {
      start.current = { x: event.nativeEvent.locationX, pageX: event.nativeEvent.pageX };
      show(valueAt(event.nativeEvent.locationX));
    },
    onPressMove: (event: GestureResponderEvent) => show(valueOf(event)),
    onPressOut: (event: GestureResponderEvent) => {
      const next = valueOf(event);
      start.current = undefined;
      setDragValue(undefined);
      if (next !== value) {
        callbacks.onChange(next);
      } else {
        callbacks.onDragEnd?.();
      }
    },
  };
  return { dragValue, handlers };
}
