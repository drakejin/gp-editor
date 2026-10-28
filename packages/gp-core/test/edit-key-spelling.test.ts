import { describe, expect, it } from 'vitest';
import { keySignatureOf, keyTonic, moveDiatonic, pitchOfSpelling, shiftDiatonic, spellInKey, transposeKeySignature } from '../src/edit/key-spelling';

const C_MAJOR = 0;
const G_MAJOR = 1;
const F_SHARP_MAJOR = 6;
const F_MAJOR = -1;
const C_MINOR = -3;
const MIDDLE_C = 60;
/** Letters: C = 0 … B = 6; middle C's octave starts at step 28. */
const OCTAVE_4 = 28;

describe('spellInKey', () => {
  it('spells notes of the key with the key’s own letters, E# in F# major', () => {
    expect(spellInKey(MIDDLE_C, C_MAJOR)).toEqual({ step: OCTAVE_4, alter: 0 });
    expect(spellInKey(66, G_MAJOR)).toEqual({ step: OCTAVE_4 + 3, alter: 1 });
    expect(spellInKey(65, F_SHARP_MAJOR)).toEqual({ step: OCTAVE_4 + 2, alter: 1 });
    expect(spellInKey(70, F_MAJOR)).toEqual({ step: OCTAVE_4 + 6, alter: -1 });
  });

  it('spells other white keys as naturals and black keys as sharps in sharp keys and C, flats in flat keys', () => {
    expect(spellInKey(65, G_MAJOR)).toEqual({ step: OCTAVE_4 + 3, alter: 0 });
    expect(spellInKey(61, C_MAJOR)).toEqual({ step: OCTAVE_4, alter: 1 });
    expect(spellInKey(61, F_MAJOR)).toEqual({ step: OCTAVE_4 + 1, alter: -1 });
  });

  it('spells a black key as a flat in C when asked to', () => {
    expect(spellInKey(70, C_MAJOR, 'flat')).toEqual({ step: OCTAVE_4 + 6, alter: -1 });
    expect(spellInKey(70, G_MAJOR, 'flat')).toEqual({ step: OCTAVE_4 + 6, alter: -1 });
  });

  it('round-trips through pitchOfSpelling for every pitch in every key', () => {
    for (let key = -7; key <= 7; key++) {
      for (let pitch = 0; pitch <= 127; pitch++) {
        expect(pitchOfSpelling(spellInKey(pitch, key))).toBe(pitch);
      }
    }
  });
});

describe('shiftDiatonic', () => {
  it('moves notes of the key along its scale', () => {
    // Arrange: E4, C4 in C major.
    // Act + Assert
    expect(shiftDiatonic(64, C_MAJOR, 1)).toBe(65);
    expect(shiftDiatonic(64, C_MAJOR, 2)).toBe(67);
    expect(shiftDiatonic(MIDDLE_C, C_MAJOR, 7)).toBe(72);
    expect(shiftDiatonic(MIDDLE_C, C_MAJOR, -1)).toBe(59);
    expect(shiftDiatonic(66, G_MAJOR, -1)).toBe(64);
  });

  it('keeps a raised degree raised and a lowered one lowered', () => {
    // F# in C major (raised 4th) up a step is G#; F natural in G major (lowered 7th) up a step is G flat.
    expect(shiftDiatonic(66, C_MAJOR, 1)).toBe(68);
    expect(shiftDiatonic(65, G_MAJOR, 1)).toBe(66);
  });

  it('moves a minor key’s notes in its key signature’s scale (A minor and C major share one)', () => {
    // A minor: A3 down a step is G3; the leading tone G#4 stays raised: up a step is A#4, down a step F#4.
    expect(shiftDiatonic(57, C_MAJOR, -1)).toBe(55);
    expect(shiftDiatonic(68, C_MAJOR, 1)).toBe(70);
    expect(shiftDiatonic(68, C_MAJOR, -1)).toBe(66);
    // C minor (3 flats): E flat up two steps is G; B natural (the raised 7th) up a step is C#.
    expect(shiftDiatonic(63, C_MINOR, 2)).toBe(67);
    expect(shiftDiatonic(71, C_MINOR, 1)).toBe(73);
  });

  it('moves a spelled note by letters, keeping its alteration against the key', () => {
    expect(moveDiatonic({ step: OCTAVE_4 + 3, alter: 1 }, C_MAJOR, 1)).toEqual({ step: OCTAVE_4 + 4, alter: 1 });
    expect(moveDiatonic({ step: OCTAVE_4 + 6, alter: -1 }, F_MAJOR, 1)).toEqual({ step: OCTAVE_4 + 7, alter: 0 });
  });
});

describe('transposeKeySignature', () => {
  it('moves the key round the circle of fifths, choosing the spelling with fewer accidentals', () => {
    expect(transposeKeySignature(C_MAJOR, 2)).toBe(2);
    expect(transposeKeySignature(C_MAJOR, -2)).toBe(-2);
    expect(transposeKeySignature(C_MAJOR, 1)).toBe(-5);
    expect(transposeKeySignature(C_MAJOR, -1)).toBe(5);
    expect(transposeKeySignature(7, 1)).toBe(2);
    expect(transposeKeySignature(-7, -1)).toBe(-2);
    expect(transposeKeySignature(3, 12)).toBe(3);
    expect(transposeKeySignature(2, 0)).toBe(2);
  });

  it('keeps the side of the key at six accidentals: F → G flat, G → F sharp; from C by the direction', () => {
    expect(transposeKeySignature(F_MAJOR, 1)).toBe(-6);
    expect(transposeKeySignature(G_MAJOR, -1)).toBe(6);
    expect(transposeKeySignature(C_MAJOR, 6)).toBe(6);
    expect(transposeKeySignature(C_MAJOR, -6)).toBe(-6);
  });

  it('keeps a key signature that is not a whole number of accidentals from -7 to 7 as it is', () => {
    expect(transposeKeySignature(9, 2)).toBe(9);
    expect(transposeKeySignature(1.5, 2)).toBe(1.5);
  });
});

/** Letters: C = 0, D = 1, E = 2, F = 3, G = 4, A = 5, B = 6. */
const [C, D, E, F, G, A, B] = [0, 1, 2, 3, 4, 5, 6];

describe('keySignatureOf', () => {
  it('gives the accidentals of a major key from its tonic', () => {
    expect(keySignatureOf(C, 0, 'major')).toBe(0);
    expect(keySignatureOf(G, 0, 'major')).toBe(1);
    expect(keySignatureOf(F, 1, 'major')).toBe(6);
    expect(keySignatureOf(C, 1, 'major')).toBe(7);
    expect(keySignatureOf(F, 0, 'major')).toBe(-1);
    expect(keySignatureOf(B, -1, 'major')).toBe(-2);
    expect(keySignatureOf(C, -1, 'major')).toBe(-7);
  });

  it('gives a minor key the accidentals of its relative major', () => {
    expect(keySignatureOf(A, 0, 'minor')).toBe(0);
    expect(keySignatureOf(E, 0, 'minor')).toBe(1);
    expect(keySignatureOf(D, 0, 'minor')).toBe(-1);
    expect(keySignatureOf(C, 0, 'minor')).toBe(C_MINOR);
    expect(keySignatureOf(A, 1, 'minor')).toBe(7);
    expect(keySignatureOf(A, -1, 'minor')).toBe(-7);
  });

  it('has no key signature for a key beyond seven accidentals or a letter that is none', () => {
    expect(keySignatureOf(G, 1, 'major')).toBeUndefined();
    expect(keySignatureOf(F, -1, 'major')).toBeUndefined();
    expect(keySignatureOf(D, -1, 'minor')).toBeUndefined();
    expect(keySignatureOf(7, 0, 'major')).toBeUndefined();
  });
});

describe('keyTonic', () => {
  it('names the tonic of a key signature’s major and minor keys, the inverse of keySignatureOf', () => {
    expect(keyTonic(0, 'major')).toEqual({ letter: C, alter: 0 });
    expect(keyTonic(0, 'minor')).toEqual({ letter: A, alter: 0 });
    expect(keyTonic(6, 'major')).toEqual({ letter: F, alter: 1 });
    expect(keyTonic(6, 'minor')).toEqual({ letter: D, alter: 1 });
    expect(keyTonic(-3, 'major')).toEqual({ letter: E, alter: -1 });
    expect(keyTonic(-3, 'minor')).toEqual({ letter: C, alter: 0 });
    for (let key = -7; key <= 7; key++) {
      for (const mode of ['major', 'minor'] as const) {
        const tonic = keyTonic(key, mode);
        expect(keySignatureOf(tonic.letter, tonic.alter, mode)).toBe(key);
      }
    }
  });
});
