import { useCallback, useMemo, useState } from 'react';
import type { ScaleChoice } from '@gp-editor/core';
import { type ScaleHighlight, scaleHighlight } from '../score/scale-marks';

/** Tools ▸ Scales…: the panel, and the scale marked on the piano keyboard and the fretboard (as TuxGuitar's ScaleManager). */
export interface ScalesTool {
  readonly isOpen: boolean;
  /** The chosen scale; it stays marked after the panel closes, until cleared. */
  readonly choice?: ScaleChoice;
  readonly highlight?: ScaleHighlight;
  readonly open: () => void;
  readonly close: () => void;
  readonly choose: (choice: ScaleChoice) => void;
  readonly clear: () => void;
}

export function useScales(): ScalesTool {
  const [isOpen, setIsOpen] = useState(false);
  const [choice, setChoice] = useState<ScaleChoice | undefined>(undefined);
  const highlight = useMemo(() => scaleHighlight(choice), [choice]);
  return {
    isOpen,
    choice,
    highlight,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    choose: useCallback((next: ScaleChoice) => setChoice(next), []),
    clear: useCallback(() => setChoice(undefined), []),
  };
}
