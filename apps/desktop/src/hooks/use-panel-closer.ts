import { useCallback, useRef } from 'react';

/** A panel over the window: whether it is open now, and what closes it. */
export type PanelCloser = readonly [isOpen: boolean, close: () => void];

/**
 * Esc's panel step: closes the first open panel of `closers` (the one on top first) and gives the keyboard back with
 * `onClosed`; false when none is open. It reads the panels of the latest render, so the callback stays the same while
 * `onClosed` does.
 */
export function usePanelCloser(closers: readonly PanelCloser[], onClosed: () => void): () => boolean {
  const latest = useRef(closers);
  latest.current = closers;
  return useCallback(() => {
    const open = latest.current.find(([isOpen]) => isOpen);
    if (open === undefined) {
      return false;
    }
    open[1]();
    onClosed();
    return true;
  }, [onClosed]);
}
