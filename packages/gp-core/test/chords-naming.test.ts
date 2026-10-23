import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from '../src/chords/database';
import { chordName, noteName } from '../src/chords/naming';
import { type ChordSpec, buildChordSpec } from '../src/chords/spec';

const C = 0;
const D = 2;
const E = 4;
const F_SHARP = 6;
const G = 7;
const A = 9;
const B = 11;

describe('noteName', () => {
  it('spells the twelve pitch classes with sharps or flats', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((pc) => noteName(pc))).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
    expect([1, 3, 6, 8, 10].map((pc) => noteName(pc, 'flat'))).toEqual(['Db', 'Eb', 'Gb', 'Ab', 'Bb']);
  });

  it('wraps any integer into an octave', () => {
    expect(noteName(14)).toBe('D');
    expect(noteName(-1)).toBe('B');
  });
});

describe('chordName', () => {
  it.each<[string, ChordSpec]>([
    ['C', buildChordSpec(C, 'M')],
    ['Am', buildChordSpec(A, 'm')],
    ['G7', buildChordSpec(G, '7')],
    ['Fmaj7', buildChordSpec(5, 'maj7')],
    ['Dm7', buildChordSpec(D, 'm7')],
    ['Cm(maj7)', buildChordSpec(C, 'm/maj7')],
    ['E6', buildChordSpec(E, '6')],
    ['Am6', buildChordSpec(A, 'm6')],
    ['Dsus2', buildChordSpec(D, 'sus2')],
    ['Asus4', buildChordSpec(A, 'sus4')],
    ['G7sus4', buildChordSpec(G, '7sus4')],
    ['Bdim', buildChordSpec(B, 'dim')],
    ['Bdim7', buildChordSpec(B, 'dim7')],
    ['Caug', buildChordSpec(C, 'aug')],
    ['E5', buildChordSpec(E, '5')],
  ])('names %s', (name, spec) => {
    expect(chordName(spec)).toBe(name);
  });

  it.each<[string, ChordSpec]>([
    ['C9', buildChordSpec(C, 'M', { extension: '9' })],
    ['C9', buildChordSpec(C, '7', { extension: '9' })],
    ['Cmaj9', buildChordSpec(C, 'maj7', { extension: '9' })],
    ['Am11', buildChordSpec(A, 'm7', { extension: '11' })],
    ['G13', buildChordSpec(G, '7', { extension: '13' })],
    ['Cadd9', buildChordSpec(C, 'M', { extension: '9', isAdd: true })],
    ['Cmadd9', buildChordSpec(C, 'm', { extension: '9', isAdd: true })],
    ['C6/9', buildChordSpec(C, '6', { extension: '9' })],
    ['E7#9', buildChordSpec(E, '7', { extension: '9', extensionShift: 'sharp' })],
    ['A7b9', buildChordSpec(A, 'M', { extension: '9', extensionShift: 'flat' })],
    ['G13b9', buildChordSpec(G, '7', { extension: '13', ninth: 'flat' })],
    ['D9sus4', buildChordSpec(D, 'sus4', { extension: '9' })],
  ])('names the extended chord %s', (name, spec) => {
    expect(chordName(spec)).toBe(name);
  });

  it('names altered fifths, keeping a bare triad apart from a sharp root', () => {
    expect(chordName(buildChordSpec(B, 'm7', { fifth: 'flat' }))).toBe('Bm7b5');
    expect(chordName(buildChordSpec(G, '7', { fifth: 'sharp' }))).toBe('G7#5');
    expect(chordName(buildChordSpec(C, 'M', { fifth: 'flat' }))).toBe('C(b5)');
  });

  it('adds the bass of a slash chord, spelled like the root', () => {
    expect(chordName(buildChordSpec(C, 'M', { bass: G }))).toBe('C/G');
    expect(chordName(buildChordSpec(D, 'M', { bass: F_SHARP }))).toBe('D/F#');
    expect(chordName(buildChordSpec(3, 'M', { bass: 10 }), 'flat')).toBe('Eb/Bb');
  });

  it('drops what TuxGuitar disables: alterations of dim, aug and power chords', () => {
    expect(chordName(buildChordSpec(B, 'dim', { extension: '9', fifth: 'flat' }))).toBe('Bdim');
    expect(chordName(buildChordSpec(E, '5', { extension: '9' }))).toBe('E5');
  });

  it('names every chord type differently', () => {
    const names = CHORD_TYPES.map((type) => chordName(buildChordSpec(C, type.name)));
    expect(new Set(names).size).toBe(CHORD_TYPES.length);
  });
});
