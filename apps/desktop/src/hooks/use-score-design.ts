import { type Dispatch, useCallback, useEffect, useState } from 'react';
import { type LayoutCommand, subscribeLayoutCommands } from '../native/stylesheet';
import type { EditorAction } from '../state/editor';

export interface ScoreDesign {
  /** File ▸ Stylesheet… is open (over the score, as the other panels). */
  readonly isStylesheetOpen: boolean;
  readonly openStylesheet: () => void;
  readonly closeStylesheet: () => void;
}

/** What a menu's layout command does: the stylesheet opens, Design Mode turns on or off, the positions reset. */
export function runLayoutCommand(command: LayoutCommand, openStylesheet: () => void, dispatch: Dispatch<EditorAction>): void {
  if (command === 'stylesheet') {
    openStylesheet();
  } else if (command === 'designMode') {
    dispatch({ type: 'toggleDesignMode' });
  } else {
    dispatch({ type: 'resetPositions' });
  }
}

/**
 * File ▸ Stylesheet… (F7, the panel shown while a document is open), View ▸ Design Mode and View ▸ Reset Positions
 * (the menus' events, `GPStylesheet.m`); Design Mode itself is the shown tab's editor state.
 */
export function useScoreDesign(hasDocument: boolean, dispatch: Dispatch<EditorAction>, onClosed: () => void): ScoreDesign {
  const [isOpen, setIsOpen] = useState(false);
  const openStylesheet = useCallback(() => setIsOpen(hasDocument), [hasDocument]);
  const closeStylesheet = useCallback(() => {
    setIsOpen(false);
    onClosed();
  }, [onClosed]);
  useEffect(() => subscribeLayoutCommands((command) => runLayoutCommand(command, openStylesheet, dispatch)), [openStylesheet, dispatch]);
  return { isStylesheetOpen: isOpen && hasDocument, openStylesheet, closeStylesheet };
}
