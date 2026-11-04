import { DRAG_INTENT_DISTANCE, PITCH_DRAG_STEP, dragIntent, dragSemitones, pitchDragHint } from '../src/lib/pitch-drag';
import { NOTATION } from '../src/score/notation/metrics';
import { MAX_TRANSPOSE_AMOUNT } from '../src/state/transposition';

describe('a note dragged up or down', () => {
  it('goes a semitone per half staff space, up when the pointer goes up, whole steps only', () => {
    // Arrange
    const step = PITCH_DRAG_STEP;

    // Act + Assert
    expect(step).toBe(NOTATION.space / 2);
    expect([0, -(step - 0.5), -step, -3 * step - 1, step, 2.9 * step].map(dragSemitones)).toEqual([0, 0, 1, 3, -1, -2]);
  });

  it('goes no further than the Transpose panel’s amount, two octaves either way', () => {
    expect(dragSemitones(-1000 * PITCH_DRAG_STEP)).toBe(MAX_TRANSPOSE_AMOUNT);
    expect(dragSemitones(1000 * PITCH_DRAG_STEP)).toBe(-MAX_TRANSPOSE_AMOUNT);
  });

  it('says what it is once the pointer has gone far enough: up or down a pitch, sideways a selection', () => {
    const near = DRAG_INTENT_DISTANCE - 0.5;
    expect(dragIntent(near, -near)).toBeUndefined();
    expect(dragIntent(1, -DRAG_INTENT_DISTANCE)).toBe('pitch');
    expect(dragIntent(-2, DRAG_INTENT_DISTANCE + 4)).toBe('pitch');
    expect(dragIntent(DRAG_INTENT_DISTANCE, 1)).toBe('select');
    expect(dragIntent(-DRAG_INTENT_DISTANCE - 5, DRAG_INTENT_DISTANCE + 4)).toBe('select');
  });

  it('shows the semitones with their sign while it goes, with what the move would leave behind', () => {
    expect(pitchDragHint(3)).toBe('+3 semitones: let go to move, Esc to cancel');
    expect(pitchDragHint(-1)).toBe('−1 semitone: let go to move, Esc to cancel');
    expect(pitchDragHint(2, 'Drum notes do not move.')).toBe('+2 semitones — Drum notes do not move.');
    expect(pitchDragHint(0)).toBeUndefined();
  });
});
