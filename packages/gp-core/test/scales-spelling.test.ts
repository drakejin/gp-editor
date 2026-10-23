import { describe, expect, it } from 'vitest';
import { SCALE_ROOTS, scaleIndexNamed } from '../src/scales/notes';
import { preferredScaleChoice, scaleKeySignature, scaleNoteNames } from '../src/scales/spelling';

const root = (name: string): number => SCALE_ROOTS.findIndex((candidate) => candidate.name === name);
const scale = (name: string): number => scaleIndexNamed(name) ?? -1;
const choice = (rootName: string, scaleName: string) => ({ rootIndex: root(rootName), scaleIndex: scale(scaleName) });

describe('scaleNoteNames', () => {
  it('spells a scale in the key signature that needs the fewest accidentals (TGMusicKeyUtils#getKeySignature)', () => {
    expect(scaleNoteNames(choice('A', 'Pentatonic Minor Scale'))).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(scaleNoteNames(choice('Eb', 'Major Scale'))).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
    expect(scaleNoteNames(choice('F#', 'Major Scale'))).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(scaleNoteNames(choice('Gb', 'Major Scale'))).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
  });

  it('keeps sharps for a sharp root and flats for a flat root', () => {
    expect(scaleNoteNames(choice('C#', 'Minor Scale'))).toEqual(['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B']);
    expect(scaleNoteNames(choice('Db', 'Minor Scale'))[0]).toBe('Db');
  });

  it('falls back to sharps when no key signature names every note once (the chromatic scale)', () => {
    expect(scaleNoteNames(choice('C', 'Chromatic Scale'))).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  });

  it('has no names for a choice outside the lists', () => {
    expect(scaleNoteNames({ rootIndex: 0, scaleIndex: -1 })).toEqual([]);
  });
});

describe('scaleKeySignature', () => {
  it('gives the key signature as the model counts it: sharps positive, flats negative', () => {
    expect(scaleKeySignature(choice('C', 'Major Scale'))).toBe(0);
    expect(scaleKeySignature(choice('E', 'Major Scale'))).toBe(4);
    expect(scaleKeySignature(choice('Bb', 'Major Scale'))).toBe(-2);
    expect(scaleKeySignature(choice('D', 'Minor Scale'))).toBe(-1);
    expect(scaleKeySignature({ rootIndex: -1, scaleIndex: 0 })).toBe(0);
  });
});

describe('preferredScaleChoice', () => {
  it('names a black-key root the way that needs fewer sharps and flats', () => {
    expect(SCALE_ROOTS[preferredScaleChoice(1, scale('Major Scale')).rootIndex]?.name).toBe('Db');
    expect(SCALE_ROOTS[preferredScaleChoice(10, scale('Minor Scale')).rootIndex]?.name).toBe('Bb');
    expect(SCALE_ROOTS[preferredScaleChoice(1, scale('Minor Scale')).rootIndex]?.name).toBe('C#');
    expect(SCALE_ROOTS[preferredScaleChoice(6, scale('Major Scale')).rootIndex]?.name).toBe('F#');
  });

  it('keeps a white-key root and the scale', () => {
    expect(preferredScaleChoice(9, 6)).toEqual({ rootIndex: root('A'), scaleIndex: 6 });
  });
});
