import { describe, expect, it } from 'vitest';
import { BANJO_DRONE_FRET, fretFromTab, isFiveStringBanjo, stringStartFret, tabFret } from '../src/edit/banjo';
import { STANDARD_TUNING } from '../src/model/defaults';

/** Open G (g D G B D), string 1 first: the short 5th string is the high g. */
const OPEN_G = [62, 59, 55, 50, 67];
const FIVE_STRING_BASS = [43, 38, 33, 28, 23];
const TENOR = [69, 62, 55, 48];

describe('isFiveStringBanjo', () => {
  it('knows a five-string tuning whose 5th string is above the 4th (re-entrant) as a banjo', () => {
    expect(isFiveStringBanjo(OPEN_G)).toBe(true);
    expect(isFiveStringBanjo([62, 60, 55, 48, 67])).toBe(true);
  });

  it('does not take a 5-string bass, a 4-string banjo or a guitar for one', () => {
    expect(isFiveStringBanjo(FIVE_STRING_BASS)).toBe(false);
    expect(isFiveStringBanjo(TENOR)).toBe(false);
    expect(isFiveStringBanjo(STANDARD_TUNING)).toBe(false);
  });
});

describe('stringStartFret', () => {
  it('starts the banjo drone string at the 5th fret, where its tuning peg is, and every other string at the nut', () => {
    expect(BANJO_DRONE_FRET).toBe(5);
    expect(stringStartFret(OPEN_G, 5)).toBe(5);
    expect([1, 2, 3, 4].map((string) => stringStartFret(OPEN_G, string))).toEqual([0, 0, 0, 0]);
    expect(stringStartFret(STANDARD_TUNING, 5)).toBe(0);
  });
});

describe('tabFret', () => {
  it('shows the drone string as Guitar Pro does: the file counts it from its own nut (0, 1, 2 …), the tab from the main nut (0, 6, 7 …)', () => {
    expect(tabFret(OPEN_G, 5, 0)).toBe(0);
    expect(tabFret(OPEN_G, 5, 1)).toBe(6);
    expect(tabFret(OPEN_G, 5, 7)).toBe(12);
  });

  it('leaves every other string as stored', () => {
    expect(tabFret(OPEN_G, 4, 3)).toBe(3);
    expect(tabFret(STANDARD_TUNING, 5, 3)).toBe(3);
  });
});

describe('fretFromTab', () => {
  it('turns a typed drone fret back into the stored one: 0 is the open drone, 6 its first fret', () => {
    expect(fretFromTab(OPEN_G, 5, 0)).toBe(0);
    expect(fretFromTab(OPEN_G, 5, 6)).toBe(1);
    expect(fretFromTab(OPEN_G, 5, 12)).toBe(7);
  });

  it('refuses frets 1–5 of the drone string, which does not reach them', () => {
    expect([1, 2, 3, 4, 5].map((typed) => fretFromTab(OPEN_G, 5, typed))).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('keeps any fret of the other strings, and round-trips with tabFret', () => {
    expect(fretFromTab(OPEN_G, 1, 3)).toBe(3);
    expect(fretFromTab(STANDARD_TUNING, 5, 2)).toBe(2);
    for (const stored of [0, 1, 2, 10]) {
      expect(fretFromTab(OPEN_G, 5, tabFret(OPEN_G, 5, stored))).toBe(stored);
    }
  });
});
