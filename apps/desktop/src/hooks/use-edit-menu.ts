import { useEffect } from 'react';
import type { AppCommand } from '../state/app-command';
import type { KeyCommand } from '../lib/key-commands';
import { setUndoState, subscribeUndoRequests } from '../native/gp-files';

/**
 * The menu bar's Edit ▸ Undo / Redo for the shown tab: enabled when it has something to undo / redo, and running its
 * undo / redo when chosen. In the activated app ⌘Z / ⇧⌘Z are the menu's key equivalents (the menu bar sees them before
 * the score), so they come this way too.
 */
export function useEditMenu(canUndo: boolean, canRedo: boolean, runCommand: (command: AppCommand | KeyCommand) => void): void {
  useEffect(() => {
    setUndoState(canUndo, canRedo);
  }, [canUndo, canRedo]);
  useEffect(
    () =>
      subscribeUndoRequests({
        onUndoRequested: () => runCommand({ type: 'undo' }),
        onRedoRequested: () => runCommand({ type: 'redo' }),
      }),
    [runCommand],
  );
}
