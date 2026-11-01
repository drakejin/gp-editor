import { MAX_DRUM_KEY, MAX_FRET } from '@gp-editor/core';
import { DIGIT_WINDOW_MS, type DigitPress, nextFretEntry } from '../src/lib/fret-input';

/** The digit typed as the score's `keyIndex`-th key press, `at` milliseconds. */
const press = (digit: number, at: number, keyIndex: number): DigitPress => ({ digit, at, keyIndex });

describe('nextFretEntry', () => {
  it('combines a digit with the one typed by the key press just before, within the window', () => {
    // Arrange
    const first = nextFretEntry(undefined, press(1, 1000, 1), MAX_FRET);

    // Act
    const second = nextFretEntry(first, press(2, 1000 + DIGIT_WINDOW_MS, 2), MAX_FRET);

    // Assert
    expect(first.fret).toBe(1);
    expect(second).toEqual({ fret: 12, at: 1000 + DIGIT_WINDOW_MS, keyIndex: 2 });
  });

  it('starts over after the window', () => {
    const first = nextFretEntry(undefined, press(1, 0, 1), MAX_FRET);
    expect(nextFretEntry(first, press(2, DIGIT_WINDOW_MS + 1, 2), MAX_FRET).fret).toBe(2);
  });

  it('starts over when another key was pressed between the two digits, however quickly', () => {
    const first = nextFretEntry(undefined, press(1, 0, 1), MAX_FRET);
    expect(nextFretEntry(first, press(2, 10, 3), MAX_FRET).fret).toBe(2);
  });

  it('starts over when the digits would make a fret past the last one', () => {
    expect(nextFretEntry({ fret: 3, at: 0, keyIndex: 1 }, press(5, 10, 2), MAX_FRET).fret).toBe(5);
    expect(nextFretEntry({ fret: 12, at: 0, keyIndex: 1 }, press(1, 10, 2), MAX_FRET).fret).toBe(1);
    expect(nextFretEntry({ fret: 2, at: 0, keyIndex: 1 }, press(9, 10, 2), MAX_FRET).fret).toBe(29);
  });

  it('types a drum track’s General MIDI keys: two digits (38, the snare) and three up to 127', () => {
    // Arrange
    const three = nextFretEntry(undefined, press(3, 0, 1), MAX_DRUM_KEY);
    const one = nextFretEntry(undefined, press(1, 0, 1), MAX_DRUM_KEY);
    const twelve = nextFretEntry(one, press(2, 100, 2), MAX_DRUM_KEY);

    // Act
    const snare = nextFretEntry(three, press(8, 100, 2), MAX_DRUM_KEY);
    const highest = nextFretEntry(twelve, press(7, 200, 3), MAX_DRUM_KEY);
    const tooHigh = nextFretEntry(twelve, press(8, 200, 3), MAX_DRUM_KEY);

    // Assert
    expect(snare.fret).toBe(38);
    expect(highest.fret).toBe(127);
    expect(tooHigh.fret).toBe(8);
  });
});
