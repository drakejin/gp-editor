import { DRAG_DEAD_ZONE, MIN_PITCH_DRAG_STEP, PITCH_DRAG_STEP, dragSemitones, noteDragOf, pitchDragHint } from '../src/lib/pitch-drag';
import { NOTATION } from '../src/score/notation/metrics';
import { MAX_TRANSPOSE_AMOUNT } from '../src/state/transposition';

/** The pointer `steps` semitones up (negative: down) past the dead zone, in screen points at `zoom`. */
const up = (steps: number, zoom = 1): number => -Math.sign(steps) * (DRAG_DEAD_ZONE + Math.abs(steps) * Math.max(PITCH_DRAG_STEP * zoom, MIN_PITCH_DRAG_STEP));

describe('a note dragged up or down', () => {
  it('goes a semitone per half staff space past a dead zone, up when the pointer goes up, whole steps only', () => {
    // Arrange
    const step = PITCH_DRAG_STEP;

    // Act + Assert
    expect(step).toBe(NOTATION.space / 2);
    expect([0, -DRAG_DEAD_ZONE, up(1) + 0.5, up(1), up(3) - 1, up(-1), up(-2) + 0.9 * step].map((dy) => dragSemitones(dy, 1))).toEqual([0, 0, 0, 1, 3, -1, -2]);
  });

  it('takes the step on screen with the zoom, never shorter than a few points', () => {
    expect(dragSemitones(up(2, 2), 2)).toBe(2);
    expect(dragSemitones(up(2, 2) + 1, 2)).toBe(1);
    expect(MIN_PITCH_DRAG_STEP).toBeGreaterThan(PITCH_DRAG_STEP * 0.5);
    expect(dragSemitones(up(2, 0.5), 0.5)).toBe(2);
    expect(dragSemitones(-(DRAG_DEAD_ZONE + 2 * PITCH_DRAG_STEP * 0.5), 0.5)).toBe(1);
  });

  it('goes no further than the Transpose panel’s amount, two octaves either way', () => {
    expect(dragSemitones(-1000 * PITCH_DRAG_STEP, 1)).toBe(MAX_TRANSPOSE_AMOUNT);
    expect(dragSemitones(1000 * PITCH_DRAG_STEP, 1)).toBe(-MAX_TRANSPOSE_AMOUNT);
  });

  it('becomes a pitch drag at its first semitone, a selection once it goes sideways, nothing before (a click)', () => {
    expect(noteDragOf(1, -DRAG_DEAD_ZONE - 1, 1)).toBeUndefined();
    expect(noteDragOf(2, up(1), 1)).toEqual({ kind: 'pitch', semitones: 1 });
    expect(noteDragOf(-2, up(-2), 1)).toEqual({ kind: 'pitch', semitones: -2 });
    expect(noteDragOf(DRAG_DEAD_ZONE - 0.5, 1, 1)).toBeUndefined();
    expect(noteDragOf(DRAG_DEAD_ZONE, 1, 1)).toEqual({ kind: 'select' });
    expect(noteDragOf(-12, up(1), 1)).toEqual({ kind: 'select' });
  });

  it('shows the semitones with their sign while it goes, with what the move would leave behind', () => {
    expect(pitchDragHint(3)).toBe('+3 semitones: let go to move, Esc to cancel');
    expect(pitchDragHint(-1)).toBe('−1 semitone: let go to move, Esc to cancel');
    expect(pitchDragHint(2, 'Drum notes do not move.')).toBe('+2 semitones — Drum notes do not move.');
    expect(pitchDragHint(0)).toBeUndefined();
  });
});
