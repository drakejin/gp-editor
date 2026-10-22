import { bendLabel, fretLabel } from '../src/lib/notation';
import { note } from '../test-support/songs';

describe('notation labels', () => {
  it('formats frets like Guitar Pro', () => {
    expect(fretLabel(note(1, 5))).toBe('5');
    expect(fretLabel(note(1, 5, { deadNote: true }))).toBe('x');
    expect(fretLabel(note(1, 12, { harmonic: { type: 'natural', data: 0 } }))).toBe('<12>');
    expect(fretLabel({ ...note(1, 7), isTied: true })).toBe('(7)');
    expect(fretLabel(note(1, 7, { ghostNote: true }))).toBe('(7)');
  });

  it('names bend amounts', () => {
    expect([1, 2, 4, 6, 8, 3].map(bendLabel)).toEqual(['¼', '½', 'full', '1½', '2', '½']);
  });
});
