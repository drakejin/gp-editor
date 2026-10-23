// Musical directions in playback (not in TuxGuitar, which ignores them; the states follow Guitar Pro as alphaTab's
// MidiPlaybackController plays it): D.C. / D.S. / D.S.S. jumps, "al Coda" / "al Double Coda" / "al Fine", Da Coda.
import { DIRECTION_JUMPS } from '../formats/common/directions';
import type { DirectionJump, DirectionTarget, MeasureHeader, MusicalDirection } from '../model/song';

/**
 * How playback reads the bars: normally (repeats and jumps taken), or after a jump — then one bar after the other
 * without repeats, to the end, to the Da Coda (then on from the coda, normally again) or to the fine.
 */
export type DirectionMode = 'normal' | 'jumped' | 'alCoda' | 'alDoubleCoda' | 'alFine';

export interface DirectionState {
  readonly mode: DirectionMode;
  /** Jumps already taken ("bar index:jump"): each sign sends playback back once. */
  readonly taken: readonly string[];
}

export const INITIAL_DIRECTIONS: DirectionState = { mode: 'normal', taken: [] };

export interface DirectionJumpStep {
  /** The header index playback goes on from. */
  readonly target: number;
  readonly state: DirectionState;
}

/** Where a jump goes back to (undefined: the start) and how playback goes on from there. */
interface JumpRule {
  readonly target?: DirectionTarget;
  readonly mode: DirectionMode;
}

const JUMP_RULES: Readonly<Partial<Record<DirectionJump, JumpRule>>> = {
  daCapo: { mode: 'jumped' },
  daCapoAlCoda: { mode: 'alCoda' },
  daCapoAlDoubleCoda: { mode: 'alDoubleCoda' },
  daCapoAlFine: { mode: 'alFine' },
  daSegno: { target: 'segno', mode: 'jumped' },
  daSegnoAlCoda: { target: 'segno', mode: 'alCoda' },
  daSegnoAlDoubleCoda: { target: 'segno', mode: 'alDoubleCoda' },
  daSegnoAlFine: { target: 'segno', mode: 'alFine' },
  daSegnoSegno: { target: 'segnoSegno', mode: 'jumped' },
  daSegnoSegnoAlCoda: { target: 'segnoSegno', mode: 'alCoda' },
  daSegnoSegnoAlDoubleCoda: { target: 'segnoSegno', mode: 'alDoubleCoda' },
  daSegnoSegnoAlFine: { target: 'segnoSegno', mode: 'alFine' },
};

function has(header: MeasureHeader | undefined, direction: MusicalDirection): boolean {
  return header?.directions?.includes(direction) === true;
}

/** The nearest bar with `target`: searched backwards from `from` first (a segno), or forwards first (a coda). */
function findTarget(headers: readonly MeasureHeader[], target: DirectionTarget, from: number, isBackwardsFirst: boolean): number | undefined {
  const backwards = headers.slice(0, from + 1).map((_, i) => from - i);
  const forwards = headers.slice(from).map((_, i) => from + i);
  const order = isBackwardsFirst ? [...backwards, ...forwards] : [...forwards, ...backwards];
  return order.find((index) => has(headers[index], target));
}

/** The first jump of a bar played normally that is not taken yet and has its target: where playback goes on. */
export function takeJump(headers: readonly MeasureHeader[], index: number, state: DirectionState): DirectionJumpStep | undefined {
  for (const jump of DIRECTION_JUMPS) {
    const rule = JUMP_RULES[jump];
    const key = `${index}:${jump}`;
    if (rule === undefined || !has(headers[index], jump) || state.taken.includes(key)) {
      continue;
    }
    const target = rule.target === undefined ? 0 : findTarget(headers, rule.target, index, true);
    if (target !== undefined) {
      return { target, state: { mode: rule.mode, taken: [...state.taken, key] } };
    }
  }
  return undefined;
}

/** After a jump "al Coda" (al Double Coda), the bar with the Da Coda (Da Double Coda) goes on at the coda (double coda). */
export function codaTarget(headers: readonly MeasureHeader[], index: number, mode: DirectionMode): number | undefined {
  if (mode === 'alCoda' && has(headers[index], 'daCoda')) {
    return findTarget(headers, 'coda', index, false);
  }
  return mode === 'alDoubleCoda' && has(headers[index], 'daDoubleCoda') ? findTarget(headers, 'doubleCoda', index, false) : undefined;
}

/** After a jump "al Fine", playback ends with the bar that has the fine. */
export function endsAtFine(headers: readonly MeasureHeader[], index: number, mode: DirectionMode): boolean {
  return mode === 'alFine' && has(headers[index], 'fine');
}

/**
 * After a jump, playback takes the last ending: an ending (a bar with alternate endings, and the bars after it up to
 * the next ending or repeat start) that closes with a repeat sign is skipped. The index of its last bar, or undefined.
 */
export function skippedEndingEnd(headers: readonly MeasureHeader[], index: number): number | undefined {
  if ((headers[index]?.repeatAlternative ?? 0) === 0) {
    return undefined;
  }
  for (let last = index; last < headers.length; last++) {
    const header = headers[last];
    const next = headers[last + 1];
    if ((header?.repeatClose ?? 0) > 0) {
      return last;
    }
    if (next === undefined || next.repeatOpen || next.repeatAlternative !== 0) {
      return undefined;
    }
  }
  return undefined;
}
