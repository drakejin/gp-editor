import { bendLabel, fretLabel, tabFretOf } from '../src/lib/notation';
import { makeSong, note } from '../test-support/songs';

describe('notation labels', () => {
  it('formats frets like Guitar Pro', () => {
    expect(fretLabel(note(1, 5))).toBe('5');
    expect(fretLabel(note(1, 5, { deadNote: true }))).toBe('x');
    expect(fretLabel(note(1, 12, { harmonic: { type: 'natural', data: 0 } }))).toBe('<12>');
    expect(fretLabel({ ...note(1, 7), isTied: true })).toBe('(7)');
    expect(fretLabel(note(1, 7, { ghostNote: true }))).toBe('(7)');
  });

  it('labels the fret the tab shows, which differs from the stored one on a banjo’s short 5th string', () => {
    const banjo = { ...makeSong([[]]).tracks[0]!, strings: [62, 59, 55, 50, 67].map((tuning, i) => ({ number: i + 1, tuning })) };
    expect(fretLabel({ ...note(5, 2), isTied: true }, tabFretOf(banjo, note(5, 2)))).toBe('(7)');
    expect(tabFretOf(banjo, note(5, 0))).toBe(0);
    expect(tabFretOf(banjo, note(4, 2))).toBe(2);
  });

  it('names bend amounts', () => {
    expect([1, 2, 4, 6, 8, 3].map(bendLabel)).toEqual(['¼', '½', 'full', '1½', '2', '½']);
  });
});
