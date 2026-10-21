import { MAX_FRET } from '@gp-editor/core';

/** Two digits typed within this window form one fret number (e.g. 1 then 2 → 12). */
export const DIGIT_WINDOW_MS = 800;

export interface DigitEntry {
  readonly value: number;
  readonly at: number;
}

/** Combine a typed digit with the previous one when it was typed quickly and the result is a valid fret. */
export function nextFretEntry(previous: DigitEntry | undefined, digit: number, now: number): DigitEntry {
  if (previous !== undefined && now - previous.at <= DIGIT_WINDOW_MS && previous.value < 10) {
    const combined = previous.value * 10 + digit;
    if (combined <= MAX_FRET) {
      return { value: combined, at: now };
    }
  }
  return { value: digit, at: now };
}
