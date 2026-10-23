import { describe, expect, it } from 'vitest';
import { NECK_FRETS } from '../src/edit/edit-song';
import { neckFrets, placeNotes, placePitchesNearHand, stringsNearHand } from '../src/edit/string-placement';
import { STANDARD_TUNING } from '../src/model/defaults';

const E2 = 40;
const A2 = 45;
const E4 = 64;

describe('neckFrets', () => {
  it('counts the neck from the capo', () => {
    expect(neckFrets(0)).toBe(24);
    expect(neckFrets(2)).toBe(22);
    expect(neckFrets(30)).toBe(0);
  });
});

describe('placeNotes', () => {
  it('keeps each note on its preferred string when that fret is on the neck', () => {
    // Act
    const placed = placeNotes([{ pitch: E4 + 3, preferredString: 1 }, { pitch: A2 + 2, preferredString: 5 }], STANDARD_TUNING, NECK_FRETS);

    // Assert
    expect(placed).toEqual([
      { string: 1, fret: 3, octaves: 0 },
      { string: 5, fret: 2, octaves: 0 },
    ]);
  });

  it('moves a note its preferred string cannot reach to the nearest free string', () => {
    // A2 (45) cannot be on string 4 (D3, 50): string 5 holds it at fret 0, string 6 at fret 5.
    const placed = placeNotes([{ pitch: A2, preferredString: 4 }], STANDARD_TUNING, NECK_FRETS);
    expect(placed).toEqual([{ string: 5, fret: 0, octaves: 0 }]);
  });

  it('lets an earlier note win a string both prefer, the later one taking the nearest free string', () => {
    const placed = placeNotes([{ pitch: A2 + 5, preferredString: 5 }, { pitch: A2 + 7, preferredString: 5 }], STANDARD_TUNING, NECK_FRETS);
    expect(placed).toEqual([
      { string: 5, fret: 5, octaves: 0 },
      { string: 4, fret: 2, octaves: 0 },
    ]);
  });

  it('re-places earlier notes when that is the only way every note fits (augmenting path)', () => {
    // B2 (47) comes first and takes string 6 (fret 7); F2 (41) fits string 6 only, so B2 moves to string 5 (fret 2).
    const placed = placeNotes([{ pitch: 47, preferredString: 6 }, { pitch: 41, preferredString: 6 }], STANDARD_TUNING, NECK_FRETS);
    expect(placed).toEqual([
      { string: 5, fret: 2, octaves: 0 },
      { string: 6, fret: 1, octaves: 0 },
    ]);
  });

  it('moves a note no free string holds by the fewest octaves', () => {
    // Arrange: D2 (38) is below low E; E4 + 31 is past the neck of the high E string.
    const low = { pitch: 38, preferredString: 6 };
    const high = { pitch: E4 + 31, preferredString: 1 };

    // Act
    const placed = placeNotes([low, high], STANDARD_TUNING, NECK_FRETS);

    // Assert
    expect(placed).toEqual([
      { string: 6, fret: 10, octaves: 1 },
      { string: 1, fret: 19, octaves: -1 },
    ]);
  });

  it('moves a note past the neck down an octave rather than onto a fret past 24', () => {
    const placed = placeNotes([{ pitch: E4 + 27, preferredString: 1 }], STANDARD_TUNING, NECK_FRETS);
    expect(placed).toEqual([{ string: 1, fret: 15, octaves: -1 }]);
  });

  it('leaves a note out when every string is taken', () => {
    const notes = [E2, E2 + 5, E2 + 10].map((pitch) => ({ pitch, preferredString: 1 }));
    const placed = placeNotes(notes, [64, 59], NECK_FRETS);
    expect(placed.filter((placement) => placement === undefined)).toHaveLength(1);
    expect(new Set(placed.flatMap((placement) => (placement === undefined ? [] : [placement.string]))).size).toBe(2);
  });

  it('places nothing on an empty tuning', () => {
    expect(placeNotes([{ pitch: E2, preferredString: 1 }], [], NECK_FRETS)).toEqual([undefined]);
  });
});

describe('stringsNearHand', () => {
  const C4 = 60;
  const G4 = 67;

  it('plays a single note on the string whose fret lies under the hand, an open string near the nut', () => {
    expect(stringsNearHand([E4], STANDARD_TUNING, 0, NECK_FRETS)).toEqual([1]);
    expect(stringsNearHand([C4], STANDARD_TUNING, 0, NECK_FRETS)).toEqual([2]);
    // Hand at the 7th fret: E4 is fret 9 of the G string, not the open E string.
    expect(stringsNearHand([E4], STANDARD_TUNING, 7, NECK_FRETS)).toEqual([3]);
  });

  it('keeps a chord in pitch order across the strings, the highest note on the highest string', () => {
    // C E G at the nut: G on string 1 (fret 3), E on string 2 (fret 5), C on string 3 (fret 5).
    expect(stringsNearHand([C4, E4, G4], STANDARD_TUNING, 0, NECK_FRETS)).toEqual([3, 2, 1]);
  });

  it('avoids the strings already taken', () => {
    expect(stringsNearHand([E4], STANDARD_TUNING, 0, NECK_FRETS, [1])).toEqual([2]);
  });

  it('measures the banjo drone from its peg: the open high g is under a hand at the nut', () => {
    expect(stringsNearHand([G4], [62, 59, 55, 50, 67], 0, NECK_FRETS)).toEqual([5]);
  });

  it('still names a string when no free string plays the note, so placeNotes can move it by an octave', () => {
    // E2 only fits string 6, which is taken.
    expect(stringsNearHand([E2], STANDARD_TUNING, 0, NECK_FRETS, [6])).toEqual([1]);
  });
});

describe('placePitchesNearHand', () => {
  it('places a played chord on separate strings near the hand, at its pitch', () => {
    // Act
    const placed = placePitchesNearHand([60, 64, 67], STANDARD_TUNING, 0, NECK_FRETS);

    // Assert
    expect(placed).toEqual([
      { string: 3, fret: 5, octaves: 0 },
      { string: 2, fret: 5, octaves: 0 },
      { string: 1, fret: 3, octaves: 0 },
    ]);
  });

  it('marks a pitch below the lowest string as moved by an octave, so step entry can leave it out', () => {
    const placed = placePitchesNearHand([E2 - 2], STANDARD_TUNING, 0, NECK_FRETS);
    expect(placed[0]?.octaves).toBe(1);
  });
});
