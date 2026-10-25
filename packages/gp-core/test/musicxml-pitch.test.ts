import { describe, expect, it } from 'vitest';
import { spellPitch } from '../src/write/musicxml/musicxml-pitch';
import { alterationInKey, letterIndexInKey, toTuxSignature } from '../src/scales/spelling';

describe('spellPitch', () => {
  it('spells a black key as a sharp under sharps and as a flat under flats', () => {
    // Act
    const inG = spellPitch(66, 1);
    const inF = spellPitch(70, -1);

    // Assert
    expect(inG).toEqual({ step: 'F', alter: 1, octave: 4 });
    expect(inF).toEqual({ step: 'B', alter: -1, octave: 4 });
  });

  it('writes E# in six sharps, B#3 in seven sharps and Cb4 in six or seven flats', () => {
    // Act
    const spelled = [spellPitch(65, 6), spellPitch(60, 7), spellPitch(59, -6), spellPitch(59, -7), spellPitch(64, -7)];

    // Assert
    expect(spelled).toEqual([
      { step: 'E', alter: 1, octave: 4 },
      { step: 'B', alter: 1, octave: 3 },
      { step: 'C', alter: -1, octave: 4 },
      { step: 'C', alter: -1, octave: 4 },
      { step: 'F', alter: -1, octave: 4 },
    ]);
  });

  it('keeps pitches within C0 … G9 and key signatures within seven accidentals', () => {
    // Act
    const spelled = [spellPitch(3, 0), spellPitch(130, 0), spellPitch(66, 12), spellPitch(70, -12)];

    // Assert
    expect(spelled).toEqual([
      { step: 'C', alter: 0, octave: 0 },
      { step: 'G', alter: 0, octave: 9 },
      { step: 'F', alter: 1, octave: 4 },
      { step: 'B', alter: -1, octave: 4 },
    ]);
  });
});

describe('the key signature tables (scales/spelling)', () => {
  it('number the model key signature as TuxGuitar does: sharps 1–7, flats 8–14', () => {
    // Act
    const signatures = [0, 3, 7, -1, -7, 9, -9, 2.7, -2.7].map(toTuxSignature);

    // Assert
    expect(signatures).toEqual([0, 3, 7, 8, 14, 7, 14, 2, 9]);
  });

  it('give each pitch class of D major and Eb major its letter and alteration', () => {
    // Act
    const dMajor = [2, 4, 6, 7, 9, 11, 1].map((pitchClass) => [letterIndexInKey(pitchClass, 2), alterationInKey(pitchClass, 2)]);
    const ebMajor = [3, 5, 7, 8, 10, 0, 2].map((pitchClass) => [letterIndexInKey(pitchClass, 10), alterationInKey(pitchClass, 10)]);

    // Assert
    expect(dMajor).toEqual([[1, 'natural'], [2, 'natural'], [3, 'sharp'], [4, 'natural'], [5, 'natural'], [6, 'natural'], [0, 'sharp']]);
    expect(ebMajor).toEqual([[2, 'flat'], [3, 'natural'], [4, 'natural'], [5, 'flat'], [6, 'flat'], [0, 'natural'], [1, 'natural']]);
  });
});
