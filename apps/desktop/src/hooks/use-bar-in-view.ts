import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { scrollOffsetToShowBar } from '../score/bar-map';

export interface BarInView {
  readonly scrollRef: RefObject<ScrollView | null>;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Keeps a bar of the bar map in its horizontal scroll view: when `measureIndex` changes (and once the view has a
 * width) the view scrolls just enough to show it with a margin; a bar already in view leaves the scroll alone.
 * Spread `onLayout` / `onScroll` on the ScrollView (with a `scrollEventThrottle`) and give it `scrollRef`.
 */
export function useBarInView(measureIndex: number | undefined): BarInView {
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const viewportWidth = useRef(0);
  const reveal = useCallback((index: number | undefined) => {
    if (index === undefined) {
      return;
    }
    const offset = scrollOffsetToShowBar(index, scrollX.current, viewportWidth.current);
    if (offset !== undefined) {
      scrollX.current = offset;
      // A jump, as Guitar Pro does: react-native-macos's animated scrollTo (its NSClipView animator) leaves this
      // horizontal scroll view where it was.
      scrollRef.current?.scrollTo({ x: offset, animated: false });
    }
  }, []);
  useEffect(() => reveal(measureIndex), [measureIndex, reveal]);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidth.current = event.nativeEvent.layout.width;
      reveal(measureIndex);
    },
    [measureIndex, reveal],
  );
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = event.nativeEvent.contentOffset.x;
  }, []);
  return { scrollRef, onLayout, onScroll };
}
