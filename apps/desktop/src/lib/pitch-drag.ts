import { NOTATION } from '../score/notation/metrics';
import { clampTransposeAmount } from '../state/transposition';
import { t } from './i18n/i18n';

// A note dragged up or down with the mouse moves by semitones (notation editors drag a notehead so; Guitar Pro 8 has no
// such drag): a press on a note that goes up or down is a pitch drag, one that goes sideways a selection, as before.

/**
 * One semitone per this much vertical drag, in layout points (on screen it grows and shrinks with the score's zoom, as
 * the staff does): half a staff space, the step from a line to the next space — 4 points at 100 %, about a third of the
 * tab's string gap, so a fret number dragged past the next string has gone 3 semitones.
 */
export const PITCH_DRAG_STEP = NOTATION.space / 2;

/** The shortest step on screen (points), so a zoomed-out score does not take a twitch of the hand for a semitone. */
export const MIN_PITCH_DRAG_STEP = 3;

/** How far (screen points) the pointer goes from a pressed note before the drag does anything: less is a click. */
export const DRAG_DEAD_ZONE = 3;

/**
 * How a gesture that began on a note ended: a pitch drag let go, a click (let go before it did anything), a selection
 * drag from the note's beat, or lost (its row went away before the mouse came up): nothing is done then.
 */
export type NoteGestureEnd = 'drag' | 'click' | 'select' | 'cancel';

/** What a drag that began on a note has become: a selection of beats (sideways), or the note's pitch (up or down). */
export type NoteDrag = { readonly kind: 'select' } | { readonly kind: 'pitch'; readonly semitones: number };

/**
 * The semitones a pitch drag has reached with the pointer `dy` screen points below where it went down, at `zoom`: up is
 * higher, past DRAG_DEAD_ZONE a whole step per semitone (PITCH_DRAG_STEP zoomed, at least MIN_PITCH_DRAG_STEP), within
 * the Transpose panel's ±24.
 */
export function dragSemitones(dy: number, zoom: number): number {
  const step = Math.max(PITCH_DRAG_STEP * zoom, MIN_PITCH_DRAG_STEP);
  const steps = Math.floor(Math.max(0, Math.abs(dy) - DRAG_DEAD_ZONE) / step);
  return clampTransposeAmount(dy < 0 ? steps : -steps);
}

/**
 * What a drag from a note that has not yet said what it is becomes with the pointer (dx, dy) screen points from where it
 * went down: a selection once it goes sideways past the dead zone, a pitch drag once it reaches a semitone; undefined
 * until then (so a hand that wobbles going sideways still selects, and a click moves nothing).
 */
export function noteDragOf(dx: number, dy: number, zoom: number): NoteDrag | undefined {
  if (Math.abs(dx) > Math.abs(dy)) {
    return Math.abs(dx) >= DRAG_DEAD_ZONE ? { kind: 'select' } : undefined;
  }
  const semitones = dragSemitones(dy, zoom);
  return semitones === 0 ? undefined : { kind: 'pitch', semitones };
}

/** "+3 semitones", "−1 semitone". */
function signedSemitones(semitones: number): string {
  return `${semitones > 0 ? '+' : '−'}${t('common.semitones', { count: Math.abs(semitones) })}`;
}

/**
 * The hint over the score while a note is dragged: the semitones so far and what letting go does, or what the move
 * would leave behind (`left`: the semitone shift's hint — notes with no free string, a drum track). None at 0.
 */
export function pitchDragHint(semitones: number, left?: string): string | undefined {
  if (semitones === 0) {
    return undefined;
  }
  const amount = signedSemitones(semitones);
  return left === undefined ? t('palette.hint.pitchDrag', { amount }) : t('palette.hint.pitchDragLeft', { amount, hint: left });
}
