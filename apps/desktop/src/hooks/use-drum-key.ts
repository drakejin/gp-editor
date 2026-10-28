import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeDrumKeyRequests } from '../native/gp-files';

/** View ▸ Drum Key: the card over the score that shows how the shown drum track's drums are written. */
export interface DrumKey {
  readonly isOpen: boolean;
  /** Every drum of Guitar Pro's kit, not only those the track uses. */
  readonly showsWholeKit: boolean;
  readonly setShowsWholeKit: (showsWholeKit: boolean) => void;
  /** Shows the key, or hides it (the keyboard goes back to the score). */
  readonly toggle: () => void;
  readonly close: () => void;
}

/** The Drum Key's state for this window: View ▸ Drum Key, the command palette, the drum kit view's and the inspector's buttons. */
export function useDrumKey(onClosed: () => void): DrumKey {
  const [isOpen, setIsOpen] = useState(false);
  const [showsWholeKit, setShowsWholeKit] = useState(false);
  const close = useCallback(() => {
    setIsOpen(false);
    onClosed();
  }, [onClosed]);
  const toggle = useCallback(() => (isOpen ? close() : setIsOpen(true)), [isOpen, close]);
  // The menu's event calls the latest toggle without subscribing again on every change.
  const latestToggle = useRef(toggle);
  latestToggle.current = toggle;
  useEffect(() => subscribeDrumKeyRequests(() => latestToggle.current()), []);
  return useMemo(() => ({ isOpen, showsWholeKit, setShowsWholeKit, toggle, close }), [isOpen, showsWholeKit, toggle, close]);
}
