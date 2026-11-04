import { NOTATION } from '../score/notation/metrics';
import { clampTransposeAmount } from '../state/transposition';
import { t } from './i18n/i18n';

// A note dragged up or down with the mouse moves by semitones (notation editors drag a notehead so; Guitar Pro 8 has no
// such drag): a press on a note that goes up or down is a pitch drag, one that goes sideways a selection, as before.

/**
 * One semitone per this much vertical drag, in layout points (on screen it grows and shrinks with the score's zoom, as
 * the staff does): half a staff space, the step from a line to the next space — 4 points, about a third of the tab's
 * string gap, so a fret number dragged past the next string has gone 3 semitones.
 */
export const PITCH_DRAG_STEP = NOTATION.space / 2;

/** How far (layout points) the pointer goes from a pressed note before the drag says what it is; less is a click. */
export const DRAG_INTENT_DISTANCE = 3;

/** What a drag that began on a note does: the note's pitch (up or down), or a selection of beats (sideways). */
export type DragIntent = 'pitch' | 'select';

/** How a gesture that began on a note ended: a pitch drag let go, a click, or a selection drag from the note's beat. */
export type NoteGestureEnd = 'drag' | 'click' | 'select';

/** The drag's kind once the pointer has gone DRAG_INTENT_DISTANCE from the note (dx, dy in layout points); undefined before. */
export function dragIntent(dx: number, dy: number): DragIntent | undefined {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_INTENT_DISTANCE) {
    return undefined;
  }
  return Math.abs(dy) >= Math.abs(dx) ? 'pitch' : 'select';
}

/**
 * The semitones a pitch drag has reached with the pointer `dy` layout points below where it went down: up is higher, a
 * whole PITCH_DRAG_STEP per semitone, within the Transpose panel's ±24.
 */
export function dragSemitones(dy: number): number {
  const steps = Math.floor(Math.abs(dy) / PITCH_DRAG_STEP);
  return clampTransposeAmount(dy < 0 ? steps : -steps);
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
