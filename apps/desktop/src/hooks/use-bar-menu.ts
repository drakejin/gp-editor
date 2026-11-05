import { type Dispatch, useCallback, useEffect, useMemo, useState } from 'react';
import type { Song, StringAddress } from '@gp-editor/core';
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
  /** The shown tab's song: the menu acts on the bars of this song only. */
  readonly song?: Song;
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
  /** The song it was opened on: any edit (a key, a menu, the MCP server, undo, a track added or gone) closes it. */
  readonly song?: Song;
  readonly target: BarMenuTarget;
  readonly anchor: PanelAnchor;
}

export function useBarMenu({ tabId, song, cursor, selectionAnchor, dispatch, onClosed }: BarMenuSources): BarMenu {
  const [opened, setOpened] = useState<OpenBarMenu | undefined>(undefined);
  // Another tab shown or the song edited closes it — for good: the bars it names may be others now.
  const shown = opened !== undefined && opened.tabId === tabId && opened.song === song ? opened : undefined;
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
    setOpened({ tabId, song, target, anchor });
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
