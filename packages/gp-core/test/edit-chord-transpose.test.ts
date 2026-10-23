import { describe, expect, it } from 'vitest';
import { chromaticNameMove, diatonicNameMove, shiftChordDiagram, transposeChord, transposeChordName } from '../src/edit/chord-transpose';
import { NECK_FRETS } from '../src/edit/edit-song';
import type { Chord } from '../src/model/song';

const C_MAJOR = 0;
const D_MAJOR = 2;
const F_MAJOR = -1;

function up(semitones: number, keySignature = C_MAJOR): ReturnType<typeof chromaticNameMove> {
  return chromaticNameMove(semitones, keySignature);
}

describe('transposeChordName: chromatic', () => {
  it('moves the root and keeps the rest of the symbol', () => {
    expect(transposeChordName('Am7', up(2, D_MAJOR))).toEqual({ name: 'Bm7', rootShift: 2 });
    expect(transposeChordName('C7b9', up(2, D_MAJOR)).name).toBe('D7b9');
    expect(transposeChordName('F#m', up(-1)).name).toBe('Fm');
    expect(transposeChordName('Bb', up(1)).name).toBe('B');
  });

  it('moves the bass of a slash chord, with a slash or TuxGuitar’s backslash', () => {
    expect(transposeChordName('C/G', up(2, D_MAJOR)).name).toBe('D/A');
    expect(transposeChordName('C \\G', up(2, D_MAJOR)).name).toBe('D \\A');
    expect(transposeChordName('Am7/G#', up(-2)).name).toBe('Gm7/F#');
  });

  it('spells roots of the key as the key does, others by the key’s side or, in C, by the symbol and the direction', () => {
    expect(transposeChordName('C', up(-2, -2)).name).toBe('Bb');
    expect(transposeChordName('C', up(1, 2)).name).toBe('C#');
    expect(transposeChordName('A', up(1)).name).toBe('A#');
    expect(transposeChordName('B', up(-1)).name).toBe('Bb');
    expect(transposeChordName('Gb', up(4)).name).toBe('Bb');
    expect(transposeChordName('F#', up(4)).name).toBe('A#');
    expect(transposeChordName('Gb', up(2, F_MAJOR)).name).toBe('Ab');
  });

  it('leaves a name without a note as it is', () => {
    expect(transposeChordName('N.C.', up(2))).toEqual({ name: 'N.C.', rootShift: undefined });
    expect(transposeChordName('', up(2))).toEqual({ name: '', rootShift: undefined });
    expect(transposeChordName('riff', up(2)).name).toBe('riff');
  });
});

describe('transposeChordName: diatonic', () => {
  it('moves the root and the bass along the key’s scale, keeping their alterations', () => {
    expect(transposeChordName('C', diatonicNameMove(1, C_MAJOR))).toEqual({ name: 'D', rootShift: 2 });
    expect(transposeChordName('F#', diatonicNameMove(1, C_MAJOR)).name).toBe('G#');
    expect(transposeChordName('Bb', diatonicNameMove(1, F_MAJOR))).toEqual({ name: 'C', rootShift: 2 });
    expect(transposeChordName('E/G#', diatonicNameMove(1, C_MAJOR)).name).toBe('F/A#');
    expect(transposeChordName('C', diatonicNameMove(-1, C_MAJOR))).toEqual({ name: 'B', rootShift: -1 });
  });

  it('writes a doubly altered root as its simpler name', () => {
    // G major: E# (a raised 6th) up a step is F## — written G; F major: Cb (a lowered 1st) down a step is Bbb — written A.
    expect(transposeChordName('E#', diatonicNameMove(1, 1)).name).toBe('G');
    expect(transposeChordName('Cb', diatonicNameMove(-1, F_MAJOR)).name).toBe('A');
    expect(transposeChordName('F', diatonicNameMove(1, 1)).name).toBe('Gb');
  });
});

describe('shiftChordDiagram', () => {
  const C_OPEN: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };
  const E_OPEN: Chord = { name: 'E', firstFret: 1, frets: [0, 0, 1, 2, 2, 0] };

  it('moves the frets on the same strings and the diagram window with them', () => {
    expect(shiftChordDiagram(C_OPEN, 2, NECK_FRETS)).toEqual({ name: 'C', firstFret: 2, frets: [2, 3, 2, 4, 5, -1] });
  });

  it('moves the shape an octave the other way when the shift leaves the neck', () => {
    expect(shiftChordDiagram(E_OPEN, -1, NECK_FRETS)).toEqual({ name: 'E', firstFret: 11, frets: [11, 11, 12, 13, 13, 11] });
  });

  it('gives undefined when no octave of the shift fits the shape on the neck', () => {
    const wide: Chord = { name: 'X', firstFret: 1, frets: [0, 20, -1] };
    expect(shiftChordDiagram(wide, 5, NECK_FRETS)).toBeUndefined();
  });

  it('keeps a diagram without played strings', () => {
    const blank: Chord = { name: 'C', firstFret: 1, frets: [-1, -1] };
    expect(shiftChordDiagram(blank, 3, NECK_FRETS)).toBe(blank);
  });
});

describe('transposeChord', () => {
  it('moves the name and the diagram by the root’s shift', () => {
    const chord: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };
    expect(transposeChord(chord, up(2, D_MAJOR), undefined, NECK_FRETS)).toEqual({ name: 'D', firstFret: 2, frets: [2, 3, 2, 4, 5, -1] });
  });

  it('moves the diagram of a chord without a root by the given shift, and keeps it without one', () => {
    const chord: Chord = { name: '', firstFret: 1, frets: [3, -1] };
    expect(transposeChord(chord, up(2), 2, NECK_FRETS)).toEqual({ name: '', firstFret: 3, frets: [5, -1] });
    expect(transposeChord(chord, up(2), undefined, NECK_FRETS)).toBe(chord);
  });

  it('gives undefined when the diagram cannot move', () => {
    const chord: Chord = { name: 'C', firstFret: 1, frets: [0, 20] };
    expect(transposeChord(chord, up(5), undefined, NECK_FRETS)).toBeUndefined();
  });
});
