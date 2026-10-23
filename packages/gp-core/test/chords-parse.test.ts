import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from '../src/chords/database';
import { chordName } from '../src/chords/naming';
import { parseChordName } from '../src/chords/parse';
import { type ChordExtension, type DegreeShift, buildChordSpec } from '../src/chords/spec';

describe('parseChordName', () => {
  it('reads the root, type and bass of common chord symbols', () => {
    expect(parseChordName('Am7')).toEqual(buildChordSpec(9, 'm7'));
    expect(parseChordName('C/G')).toEqual(buildChordSpec(0, 'M', { bass: 7 }));
    expect(parseChordName('F#m7b5')).toEqual(buildChordSpec(6, 'm7', { fifth: 'flat' }));
    expect(parseChordName('Bbmaj7')).toEqual(buildChordSpec(10, 'maj7'));
    expect(parseChordName('Dsus4')).toEqual(buildChordSpec(2, 'sus4'));
    expect(parseChordName('G9')).toEqual(buildChordSpec(7, 'M', { extension: '9' }));
  });

  it('accepts the usual other spellings', () => {
    expect(parseChordName('Cmin')).toEqual(parseChordName('Cm'));
    expect(parseChordName('C-7')).toEqual(parseChordName('Cm7'));
    expect(parseChordName('CM7')).toEqual(parseChordName('Cmaj7'));
    expect(parseChordName('CΔ7')).toEqual(parseChordName('Cmaj7'));
    expect(parseChordName('Cø')).toEqual(parseChordName('Cm7b5'));
    expect(parseChordName('C°7')).toEqual(parseChordName('Cdim7'));
    expect(parseChordName('C+')).toEqual(parseChordName('Caug'));
    expect(parseChordName('Csus')).toEqual(parseChordName('Csus4'));
    expect(parseChordName('CmM7')).toEqual(parseChordName('Cm(maj7)'));
    expect(parseChordName('Cadd2')).toEqual(parseChordName('Cadd9'));
    expect(parseChordName('C69')).toEqual(parseChordName('C6/9'));
    expect(parseChordName('C♯m')).toEqual(parseChordName('C#m'));
    expect(parseChordName('E♭')).toEqual(parseChordName('Eb'));
    expect(parseChordName('Cmaj')).toEqual(parseChordName('C'));
  });

  it('takes the root and bass in any case, and trims the text', () => {
    expect(parseChordName('  am7/g ')).toEqual(buildChordSpec(9, 'm7', { bass: 7 }));
  });

  it('keeps a slash that does not name a bass note inside the chord (6/9)', () => {
    expect(parseChordName('C6/9/E')).toEqual(buildChordSpec(0, '6', { extension: '9', isAdd: true, bass: 4 }));
  });

  it.each(['', 'H', 'Cxyz', 'C/H', '7', 'C#/', 'Cm7b5b5'])('returns undefined for %j', (text) => {
    expect(parseChordName(text)).toBeUndefined();
  });

  it('reads back every name chordName writes, as a chord of that name', () => {
    const extensions: readonly ChordExtension[] = ['none', '9', '11', '13'];
    const shifts: readonly DegreeShift[] = ['natural', 'sharp', 'flat'];
    for (const type of CHORD_TYPES) {
      for (const extension of extensions) {
        for (const extensionShift of shifts) {
          for (const fifth of shifts) {
            for (const isAdd of [false, true]) {
              const name = chordName(buildChordSpec(4, type.name, { extension, extensionShift, fifth, isAdd, ninth: extensionShift, bass: 11 }));
              const parsed = parseChordName(name);
              expect(parsed === undefined ? undefined : chordName(parsed), name).toBe(name);
            }
          }
        }
      }
    }
  });
});
