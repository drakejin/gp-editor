import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent, View } from 'react-native';

/** The top-left corner of the control that opened a panel, in the window's layout points (the panel opens beside it). */
export interface PanelAnchor {
  readonly x: number;
  readonly y: number;
}

/** A control that opens a panel beside itself: its ref, and its press handler (none without `onOpen`). */
export interface AnchoredPress {
  readonly ref: RefObject<View | null>;
  readonly onPress?: (event: GestureResponderEvent) => void;
}

/**
 * A control that opens a panel beside itself. Its press measures the control in the window's layout, where the panel
 * is placed: a click's page point counts the window's title bar on macOS (Fabric's pagePoint is from the window's
 * frame), the layout does not. Without a view to measure (tests), the click's point.
 */
export function useAnchoredPress(onOpen: ((anchor: PanelAnchor) => void) | undefined): AnchoredPress {
  const ref = useRef<View>(null);
  if (onOpen === undefined) {
    return { ref };
  }
  const onPress = (event: GestureResponderEvent) => {
    const view = ref.current;
    if (view === null || typeof view.measure !== 'function') {
      // A press from the keyboard or VoiceOver has no point: the window's corner.
      const { pageX, pageY } = event.nativeEvent;
      onOpen({ x: Number.isFinite(pageX) ? pageX : 0, y: Number.isFinite(pageY) ? pageY : 0 });
      return;
    }
    view.measure((_x, _y, _width, _height, pageX, pageY) => onOpen({ x: pageX, y: pageY }));
  };
  return { ref, onPress };
}

interface OpenTrackInfo {
  /** The tab it was opened in: another tab shown, it is closed. */
  readonly tabId?: string;
  readonly trackIndex: number;
  readonly anchor: PanelAnchor;
}

/** The shown tab and how many tracks its song has: the panel shows a track of that song only. */
export interface TrackInfoScope {
  readonly tabId?: string;
  readonly trackCount: number;
}

/**
 * Guitar Pro 8's track information (name, short name, colour, icon) in a small panel over the window, opened from a
 * track's colour or icon in the tracks panel or the Track inspector.
 */
export interface TrackInfo {
  /** The track whose information is shown; undefined while closed. */
  readonly trackIndex?: number;
  readonly anchor?: PanelAnchor;
  readonly isOpen: boolean;
  readonly open: (trackIndex: number, anchor: PanelAnchor) => void;
  /**
   * Esc, ✕, a click outside, or a track edit (the index would name another track): the keyboard goes back to the score;
   * nothing when it is closed.
   */
  readonly close: () => void;
}

export function useTrackInfo(onClosed: () => void, { tabId, trackCount }: TrackInfoScope): TrackInfo {
  const [opened, setOpened] = useState<OpenTrackInfo | undefined>(undefined);
  const open = useCallback((trackIndex: number, anchor: PanelAnchor) => setOpened({ tabId, trackIndex, anchor }), [tabId]);
  // Another tab shown (or its track gone) closes it: nothing over the score swallows keys unseen.
  const shown = opened !== undefined && opened.tabId === tabId && opened.trackIndex < trackCount ? opened : undefined;
  const isShown = shown !== undefined;
  // …and stays closed when that tab is shown again.
  useEffect(() => setOpened((current) => (current === undefined || current.tabId === tabId ? current : undefined)), [tabId]);
  const close = useCallback(() => {
    if (isShown) {
      setOpened(undefined);
      onClosed();
    }
  }, [isShown, onClosed]);
  return useMemo(() => ({ trackIndex: shown?.trackIndex, anchor: shown?.anchor, isOpen: isShown, open, close }), [shown, isShown, open, close]);
}
