// When a due autosave writes. Making a .gp snapshot of a big song holds the JS thread for a while (Hermes, 2026-11-04:
// writeSong 'gp' of a 224-bar, 9-track song ≈ 0.55–0.65 s, its base64 ≈ 5 ms; 1 MB of audio track ≈ 60 ms more), and
// every key goes through JS: so a snapshot due every AUTOSAVE_INTERVAL_MS waits for a pause in the editing (nothing
// done for AUTOSAVE_IDLE_MS, playback stopped), but never longer than AUTOSAVE_MAX_DELAY_MS.

/** How often the open documents are autosaved (the user's 30 s). */
export const AUTOSAVE_INTERVAL_MS = 30_000;
/** A pause this long in the editing lets a due snapshot be written unnoticed. */
export const AUTOSAVE_IDLE_MS = 1_500;
/** A due snapshot waits at most this long for a pause, then it is written anyway. */
export const AUTOSAVE_MAX_DELAY_MS = 30_000;

export type AutosaveStep = { readonly kind: 'write' } | { readonly kind: 'wait'; readonly ms: number };

export interface AutosaveTiming {
  readonly now: number;
  /** Since when a snapshot is due. */
  readonly dueSince: number;
  /** When the documents last changed (an edit, a cursor move, a tab). */
  readonly lastActivityAt: number;
  readonly isPlaying: boolean;
}

/** Write now, or wait (how long) for the pause — never past the longest delay. */
export function nextAutosaveStep({ now, dueSince, lastActivityAt, isPlaying }: AutosaveTiming): AutosaveStep {
  const untilLatest = dueSince + AUTOSAVE_MAX_DELAY_MS - now;
  if (untilLatest <= 0) {
    return { kind: 'write' };
  }
  const untilIdle = isPlaying ? AUTOSAVE_IDLE_MS : lastActivityAt + AUTOSAVE_IDLE_MS - now;
  return untilIdle <= 0 ? { kind: 'write' } : { kind: 'wait', ms: Math.min(untilIdle, untilLatest) };
}
