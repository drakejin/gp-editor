import { describe, expect, it } from 'vitest';
import { MAX_FRET, NECK_FRETS } from '../src/edit/edit-song';
import { type FretRange, fretRange, placeNotes } from '../src/edit/string-placement';
import { STANDARD_TUNING } from '../src/model/defaults';

const OPEN_RANGE: FretRange = { neck: NECK_FRETS, max: MAX_FRET };
const E2 = 40;
const A2 = 45;
const E4 = 64;

describe('fretRange', () => {
  it('counts the neck and edit limits from the capo', () => {
    expect(fretRange(0)).toEqual({ neck: 24, max: 29 });
    expect(fretRange(2)).toEqual({ neck: 22, max: 27 });
    expect(fretRange(30)).toEqual({ neck: 0, max: 0 });
  });
});

describe('placeNotes', () => {
  it('keeps each note on its preferred string when that fret is on the neck', () => {
    // Act
    const placed = placeNotes([{ pitch: E4 + 3, preferredString: 1 }, { pitch: A2 + 2, preferredString: 5 }], STANDARD_TUNING, OPEN_RANGE);

    // Assert
    expect(placed).toEqual([
      { string: 1, fret: 3, octaves: 0 },
      { string: 5, fret: 2, octaves: 0 },
    ]);
  });

  it('moves a note its preferred string cannot reach to the nearest free string', () => {
    // A2 (45) cannot be on string 4 (D3, 50): string 5 holds it at fret 0, string 6 at fret 5.
    const placed = placeNotes([{ pitch: A2, preferredString: 4 }], STANDARD_TUNING, OPEN_RANGE);
    expect(placed).toEqual([{ string: 5, fret: 0, octaves: 0 }]);
  });

  it('lets an earlier note win a string both prefer, the later one taking the nearest free string', () => {
    const placed = placeNotes([{ pitch: A2 + 5, preferredString: 5 }, { pitch: A2 + 7, preferredString: 5 }], STANDARD_TUNING, OPEN_RANGE);
    expect(placed).toEqual([
      { string: 5, fret: 5, octaves: 0 },
      { string: 4, fret: 2, octaves: 0 },
    ]);
  });

  it('re-places earlier notes when that is the only way every note fits (augmenting path)', () => {
    // B2 (47) comes first and takes string 6 (fret 7); F2 (41) fits string 6 only, so B2 moves to string 5 (fret 2).
    const placed = placeNotes([{ pitch: 47, preferredString: 6 }, { pitch: 41, preferredString: 6 }], STANDARD_TUNING, OPEN_RANGE);
    expect(placed).toEqual([
      { string: 5, fret: 2, octaves: 0 },
      { string: 6, fret: 1, octaves: 0 },
    ]);
  });

  it('uses a fret past the neck (up to the edit limit) before moving a note by octaves', () => {
    const placed = placeNotes([{ pitch: E4 + 27, preferredString: 1 }], STANDARD_TUNING, OPEN_RANGE);
    expect(placed).toEqual([{ string: 1, fret: 27, octaves: 0 }]);
  });

  it('moves a note no free string holds by the fewest octaves', () => {
    // Arrange: D2 (38) is below low E; E4 + 31 is past fret 29 of the high E string.
    const low = { pitch: 38, preferredString: 6 };
    const high = { pitch: E4 + 31, preferredString: 1 };

    // Act
    const placed = placeNotes([low, high], STANDARD_TUNING, OPEN_RANGE);

    // Assert
    expect(placed).toEqual([
      { string: 6, fret: 10, octaves: 1 },
      { string: 1, fret: 19, octaves: -1 },
    ]);
  });

  it('counts a note as moved when the neck range alone is allowed', () => {
    const placed = placeNotes([{ pitch: E4 + 27, preferredString: 1 }], STANDARD_TUNING, { neck: NECK_FRETS, max: NECK_FRETS });
    expect(placed).toEqual([{ string: 1, fret: 15, octaves: -1 }]);
  });

  it('leaves a note out when every string is taken', () => {
    const notes = [E2, E2 + 5, E2 + 10].map((pitch) => ({ pitch, preferredString: 1 }));
    const placed = placeNotes(notes, [64, 59], OPEN_RANGE);
    expect(placed.filter((placement) => placement === undefined)).toHaveLength(1);
    expect(new Set(placed.flatMap((placement) => (placement === undefined ? [] : [placement.string]))).size).toBe(2);
  });

  it('places nothing on an empty tuning', () => {
    expect(placeNotes([{ pitch: E2, preferredString: 1 }], [], OPEN_RANGE)).toEqual([undefined]);
  });
});
