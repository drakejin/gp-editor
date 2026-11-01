import { MAX_DRUM_KEY, MAX_FRET } from '@gp-editor/core';
import { DIGIT_WINDOW_MS, type DigitPress, type FretEntry, joinedFret } from '../src/lib/fret-input';

/** The digit typed as the score's `keyIndex`-th key press, `at` milliseconds. */
const press = (digit: number, at: number, keyIndex: number): DigitPress => ({ digit, at, keyIndex });
/** The fret typed so far by the score's `keyIndex`-th key press at `at` ms. */
const typed = (fret: number, at: number, keyIndex: number): FretEntry => ({ fret, at, keyIndex });

describe('joinedFret', () => {
  it('joins a digit to the one typed by the key press just before, within the window', () => {
    expect(joinedFret(typed(1, 1000, 1), press(2, 1000 + DIGIT_WINDOW_MS, 2), MAX_FRET)).toBe(12);
  });

  it('goes on from a leading 0 (0 then 5 is one fret)', () => {
    expect(joinedFret(typed(0, 0, 1), press(5, 10, 2), MAX_FRET)).toBe(5);
  });

  it('starts over with nothing before, after the window, or when another key was pressed between the two digits', () => {
    expect(joinedFret(undefined, press(2, 0, 1), MAX_FRET)).toBeUndefined();
    expect(joinedFret(typed(1, 0, 1), press(2, DIGIT_WINDOW_MS + 1, 2), MAX_FRET)).toBeUndefined();
    expect(joinedFret(typed(1, 0, 1), press(2, 10, 3), MAX_FRET)).toBeUndefined();
  });

  it('starts over when the digits would make a fret past the last one', () => {
    expect(joinedFret(typed(3, 0, 1), press(5, 10, 2), MAX_FRET)).toBeUndefined();
    expect(joinedFret(typed(12, 0, 1), press(1, 10, 2), MAX_FRET)).toBeUndefined();
    expect(joinedFret(typed(2, 0, 1), press(9, 10, 2), MAX_FRET)).toBe(29);
  });

  it('types a drum track’s General MIDI keys: two digits (38, the snare) and three up to 127', () => {
    expect(joinedFret(typed(3, 0, 1), press(8, 100, 2), MAX_DRUM_KEY)).toBe(38);
    expect(joinedFret(typed(12, 100, 2), press(7, 200, 3), MAX_DRUM_KEY)).toBe(127);
    expect(joinedFret(typed(12, 100, 2), press(8, 200, 3), MAX_DRUM_KEY)).toBeUndefined();
  });
});
