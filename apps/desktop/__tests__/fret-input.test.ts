import { DIGIT_WINDOW_MS, nextFretEntry } from '../src/lib/fret-input';

describe('nextFretEntry', () => {
  it('combines two quick digits into one fret', () => {
    const first = nextFretEntry(undefined, 1, 1000);
    expect(nextFretEntry(first, 2, 1000 + DIGIT_WINDOW_MS).value).toBe(12);
  });

  it('starts over after the window, past the max fret, or after two digits', () => {
    const first = nextFretEntry(undefined, 1, 0);
    expect(nextFretEntry(first, 2, DIGIT_WINDOW_MS + 1).value).toBe(2);
    expect(nextFretEntry({ value: 3, at: 0 }, 5, 10).value).toBe(5);
    expect(nextFretEntry({ value: 12, at: 0 }, 1, 10).value).toBe(1);
  });
});
