import { describe, expect, it } from 'vitest';
import { chordFirstFret, chordLabel, hasChordDiagram, isSameChord } from '../src/chords/shape';
import { shape } from './helpers/chord-shapes';

describe('chordFirstFret', () => {
  it.each<[string, readonly number[], number]>([
    ['an open chord', shape('x32010'), 1],
    ['a barre within the first five frets', shape('x24432'), 1],
    ['a barre higher up', shape('577655'), 5],
    ['open strings under a high shape', [0, 7, 9, 9, 7, 0], 7],
    ['no played string', [-1, -1, -1], 1],
  ])('starts %s at fret %d', (_, frets, expected) => {
    expect(chordFirstFret(frets)).toBe(expected);
  });
});

describe('hasChordDiagram', () => {
  it('is true when a string is played', () => {
    expect(hasChordDiagram({ name: 'C', firstFret: 1, frets: shape('x32010') })).toBe(true);
    expect(hasChordDiagram({ name: 'C', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] })).toBe(false);
  });
});

describe('chordLabel', () => {
  it('trims the name and drops control characters a file left in it', () => {
    expect(chordLabel({ name: ' Part 2, really simil\u0000', firstFret: 1, frets: [] })).toBe('Part 2, really simil');
  });
});

describe('isSameChord', () => {
  it('compares name, first fret and frets', () => {
    const c = { name: 'C', firstFret: 1, frets: shape('x32010') };
    expect(isSameChord(c, { ...c, frets: [...c.frets] })).toBe(true);
    expect(isSameChord(c, { ...c, name: 'C/E' })).toBe(false);
    expect(isSameChord(c, { ...c, firstFret: 3 })).toBe(false);
    expect(isSameChord(c, { ...c, frets: shape('x32013') })).toBe(false);
    expect(isSameChord(c, undefined)).toBe(false);
  });
});
