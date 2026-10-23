import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_REFERENCE_A4, clampReferenceA4 } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import { SILENT_INPUT, type TunerInput, type TunerStatus, nextTunerInput } from '../lib/tuner-input';
import { startAudioInput, stopAudioInput, subscribeAudioFrames } from '../native/audio-input';

/** Tools ▸ Tuner…, as the window holds it: whether the panel is open, and the reference A4 (kept for the session). */
export interface Tuner {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly referenceA4: number;
  /** Raises or lowers the reference A4 by `delta` Hz, within 415–466 Hz. */
  readonly shiftReferenceA4: (delta: number) => void;
}

/** What the microphone gives the open panel. */
export interface TunerListening {
  readonly status: TunerStatus;
  /** The last frame's input level in dBFS. */
  readonly levelDb: number;
  /** The pitch the last frames agree on; undefined while nothing is played. */
  readonly frequency?: number;
}

const STARTING: TunerStatus = { kind: 'starting' };
const LISTENING: TunerStatus = { kind: 'listening' };

export function useTuner(): Tuner {
  const [isOpen, setIsOpen] = useState(false);
  const [referenceA4, setReferenceA4] = useState(DEFAULT_REFERENCE_A4);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    referenceA4,
    shiftReferenceA4: useCallback((delta: number) => setReferenceA4((current) => clampReferenceA4(current + delta)), []),
  };
}

/** A refused start: "denied" (GPAudioInput's code when microphone access is off) or any other failure. */
function failureStatus(reason: unknown): TunerStatus {
  const code = typeof reason === 'object' && reason !== null ? (reason as { readonly code?: unknown }).code : undefined;
  return code === 'denied' ? { kind: 'denied' } : { kind: 'failed', message: errorMessage(reason, 'The microphone could not start.') };
}

/**
 * The microphone while the tuner panel is mounted: started on mount, stopped on unmount (the panel closed, or the window
 * went away); each frame is analysed by nextTunerInput. It lives in the panel, so ~12 frames a second re-render only
 * the panel, not the window.
 */
export function useTunerListening(): TunerListening {
  const [status, setStatus] = useState<TunerStatus>(STARTING);
  const [input, setInput] = useState<TunerInput>(SILENT_INPUT);
  useEffect(() => {
    let isActive = true;
    const unsubscribe = subscribeAudioFrames((body) => {
      if (isActive) {
        setInput((current) => nextTunerInput(current, body));
      }
    });
    startAudioInput()
      .then(() => isActive && setStatus(LISTENING))
      .catch((reason: unknown) => isActive && setStatus(failureStatus(reason)));
    return () => {
      isActive = false;
      unsubscribe();
      // Stopping only tears the capture down; with the panel gone there is nothing left to tell.
      stopAudioInput().catch(() => undefined);
    };
  }, []);
  return { status, levelDb: input.levelDb, frequency: input.frequency };
}
