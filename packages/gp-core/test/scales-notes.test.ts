import { describe, expect, it } from 'vitest';
import { SCALE_ROOTS, isScalePitch, scaleIndexNamed, scalePitchClasses, scaleTitle, searchScales } from '../src/scales/notes';
import { SCALES } from '../src/scales/table';

const root = (name: string): number => SCALE_ROOTS.findIndex((candidate) => candidate.name === name);
const scale = (name: string): number => scaleIndexNamed(name) ?? -1;

describe('SCALES', () => {
  it('holds TuxGuitar’s list in its order, each scale as semitones above its root', () => {
    expect(SCALES).toHaveLength(275);
    expect(SCALES[0]).toEqual({ name: 'Major Scale', intervals: [0, 2, 4, 5, 7, 9, 11] });
    expect(SCALES[6]).toEqual({ name: 'Pentatonic Minor Scale', intervals: [0, 3, 5, 7, 10] });
    expect(SCALES.at(-1)?.name).toBe('EbFbGbb SCALE: Aeolian b5b6bb7');
  });

  it('starts every scale on its root with rising semitones below an octave', () => {
    for (const definition of SCALES) {
      expect(definition.name.trim()).not.toBe('');
      expect(definition.intervals[0]).toBe(0);
      expect(definition.intervals.every((interval, i, all) => interval < 12 && (i === 0 || interval > (all[i - 1] ?? 0)))).toBe(true);
    }
  });
});

describe('SCALE_ROOTS', () => {
  it('lists the scale dialog’s 17 keys, each with its pitch class and alteration (TGScale#setKeyName)', () => {
    expect(SCALE_ROOTS.map((candidate) => candidate.name)).toEqual(['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']);
    expect(SCALE_ROOTS[root('Db')]).toEqual({ name: 'Db', pitchClass: 1, alteration: 'flat' });
    expect(SCALE_ROOTS[root('A#')]).toEqual({ name: 'A#', pitchClass: 10, alteration: 'sharp' });
    expect(SCALE_ROOTS[root('B')]).toEqual({ name: 'B', pitchClass: 11, alteration: 'natural' });
  });
});

describe('scalePitchClasses', () => {
  it('gives the scale’s notes from its root up (ScaleManager#selectScale)', () => {
    // Arrange
    const aMinorPentatonic = { rootIndex: root('A'), scaleIndex: scale('Pentatonic Minor Scale') };

    // Act
    const notes = scalePitchClasses(aMinorPentatonic);

    // Assert: A C D E G
    expect(notes).toEqual([9, 0, 2, 4, 7]);
  });

  it('has no notes for a choice outside the lists (TuxGuitar’s “None”)', () => {
    expect(scalePitchClasses({ rootIndex: 0, scaleIndex: -1 })).toEqual([]);
    expect(scalePitchClasses({ rootIndex: 17, scaleIndex: 0 })).toEqual([]);
    expect(scalePitchClasses({ rootIndex: 0.5, scaleIndex: 0 })).toEqual([]);
  });
});

describe('isScalePitch', () => {
  it('tells whether a MIDI pitch in any octave is in the scale (TGScale#getNote)', () => {
    const eMajor = { rootIndex: root('E'), scaleIndex: scale('Major Scale') };
    expect([40, 42, 44, 45, 47, 49, 51, 64].every((pitch) => isScalePitch(eMajor, pitch))).toBe(true);
    expect([41, 43, 46, 48, 50, 65].some((pitch) => isScalePitch(eMajor, pitch))).toBe(false);
    expect(isScalePitch({ rootIndex: 0, scaleIndex: -1 }, 60)).toBe(false);
  });
});

describe('scaleTitle', () => {
  it('names the root and the scale', () => {
    expect(scaleTitle({ rootIndex: root('A'), scaleIndex: scale('Pentatonic Minor Scale') })).toBe('A Pentatonic Minor Scale');
    expect(scaleTitle({ rootIndex: 0, scaleIndex: 999 })).toBe('');
  });
});

describe('searchScales', () => {
  it('finds the scales whose name holds every word of the query, in any case', () => {
    // Act
    const found = searchScales('  minor PENTA ').map((index) => SCALES[index]?.name);

    // Assert
    expect(found).toEqual(['Pentatonic Minor Scale', 'Pentatonic Minor Mode']);
  });

  it('lists every scale for a blank query and none for an unknown word', () => {
    expect(searchScales('')).toHaveLength(SCALES.length);
    expect(searchScales('zzz')).toEqual([]);
  });

  it('finds a scale index by its exact name', () => {
    expect(scaleIndexNamed('Dorian Mode')).toBe(48);
    expect(scaleIndexNamed('dorian mode')).toBeUndefined();
  });
});
