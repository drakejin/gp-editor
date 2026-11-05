import { type Dispatch, useCallback, useEffect, useMemo, useState } from 'react';
import type { StringAddress } from '@gp-editor/core';
import { type BarMenuItem, type BarMenuTarget, barMenuActions, barMenuCursor, barMenuTarget } from '../lib/bar-map-menu';
import type { EditorAction } from '../state/editor';
import { useStableCallback } from './use-stable-callback';
import type { PanelAnchor } from './use-track-info';

/** The tracks panel's bar map menu (lib/bar-map-menu.ts), over the window at the right-click. */
export interface BarMenu {
  /** What it acts on; undefined while closed. */
  readonly target?: BarMenuTarget;
  /** Where it was opened, in the window's layout points. */
  readonly anchor?: PanelAnchor;
  readonly isOpen: boolean;
  /**
   * A right-click or ⌃-click on a track's bar: the cursor goes there — unless the selection holds that bar, which then
   * stays for the menu to act on — and the menu opens at `anchor`.
   */
  readonly openAt: (trackIndex: number, measureIndex: number, anchor: PanelAnchor) => void;
  /** An item: the cursor to its bar and its edit (one undo step), then the menu closes. */
  readonly choose: (item: BarMenuItem) => void;
  /** Esc, a click outside: the keyboard goes back to the score; nothing when it is closed. */
  readonly close: () => void;
}

/** The shown tab's editor, as far as the menu needs it. */
export interface BarMenuSources {
  readonly tabId?: string;
  readonly trackCount: number;
  readonly cursor?: StringAddress;
  readonly selectionAnchor?: StringAddress;
  /** Editor actions to the shown tab. */
  readonly dispatch: Dispatch<EditorAction>;
  /** The menu went: the keyboard goes back to the score. */
  readonly onClosed: () => void;
}

interface OpenBarMenu {
  /** The tab it was opened in: another tab shown, it is closed. */
  readonly tabId?: string;
  readonly target: BarMenuTarget;
  readonly anchor: PanelAnchor;
}

export function useBarMenu({ tabId, trackCount, cursor, selectionAnchor, dispatch, onClosed }: BarMenuSources): BarMenu {
  const [opened, setOpened] = useState<OpenBarMenu | undefined>(undefined);
  // Another tab shown, or its track gone, closes it — for good: nothing over the window swallows clicks and keys unseen.
  const shown = opened !== undefined && opened.tabId === tabId && opened.target.trackIndex < trackCount ? opened : undefined;
  const isShown = shown !== undefined;
  useEffect(() => {
    if (!isShown) {
      setOpened(undefined);
    }
  }, [isShown]);
  // Read when the bar is clicked: the menu's handler keeps its identity while the cursor moves.
  const openAt = useStableCallback((trackIndex: number, measureIndex: number, anchor: PanelAnchor) => {
    const target = barMenuTarget({ cursor, selectionAnchor }, trackIndex, measureIndex);
    if (!target.isSelection) {
      dispatch({ type: 'placeCursor', cursor: barMenuCursor(target, measureIndex) });
    }
    setOpened({ tabId, target, anchor });
  });
  const close = useCallback(() => {
    if (isShown) {
      setOpened(undefined);
      onClosed();
    }
  }, [isShown, onClosed]);
  const choose = useStableCallback((item: BarMenuItem) => {
    if (shown === undefined) {
      return;
    }
    barMenuActions(shown.target, item).forEach((action) => dispatch(action));
    close();
  });
  return useMemo(() => ({ target: shown?.target, anchor: shown?.anchor, isOpen: isShown, openAt, choose, close }), [shown, isShown, openAt, choose, close]);
}
