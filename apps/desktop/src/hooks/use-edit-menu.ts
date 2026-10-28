import { useEffect, useRef } from 'react';
import type { AppCommand } from '../state/app-command';
import { DELETE_COMMANDS, type KeyCommand } from '../lib/key-commands';
import { subscribeClipboardRequests } from '../native/clipboard';
import { setUndoState, subscribeDeleteRequests, subscribeUndoRequests } from '../native/gp-files';

/**
 * The menu bar's Edit ▸ Undo / Redo, Cut / Copy / Paste and Delete Notes / Delete Bars for the shown tab: Undo / Redo
 * enabled when it has something to undo / redo, and each running its command when chosen. In the activated app ⌘Z /
 * ⇧⌘Z / ⌘X / ⌘C / ⌘V / ⌘D are the menu's key equivalents (the menu bar sees them before the score), so they come this way
 * too (macos/…/EditMenu.swift). While a panel, sheet or menu is over the score (`isOverlayOpen`), cut / copy / paste and
 * the deletes do nothing to it, as its other keys do.
 */
export function useEditMenu(canUndo: boolean, canRedo: boolean, runCommand: (command: AppCommand | KeyCommand) => void, isOverlayOpen = false): void {
  useEffect(() => {
    setUndoState(canUndo, canRedo);
  }, [canUndo, canRedo]);
  // The latest handler, so the native subscriptions are made once: one made again on every render could miss a command
  // the menu sends in between.
  const latest = useRef({ runCommand, isOverlayOpen });
  latest.current = { runCommand, isOverlayOpen };
  useEffect(
    () =>
      subscribeUndoRequests({
        onUndoRequested: () => latest.current.runCommand({ type: 'undo' }),
        onRedoRequested: () => latest.current.runCommand({ type: 'redo' }),
      }),
    [],
  );
  useEffect(
    () =>
      subscribeClipboardRequests((command) => {
        if (!latest.current.isOverlayOpen) {
          latest.current.runCommand({ type: command });
        }
      }),
    [],
  );
  useEffect(
    () =>
      subscribeDeleteRequests((command) => {
        if (!latest.current.isOverlayOpen) {
          latest.current.runCommand(DELETE_COMMANDS[command]);
        }
      }),
    [],
  );
}
