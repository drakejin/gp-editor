import { describe, expect, it } from 'vitest';
import { harmonicFretAtOffset } from '../src/formats/common/harmonics';
import { STROKE_VALUES, durationFromTicks, plainDuration } from '../src/model/defaults';
import { strokeValueFromTicks, tremoloPickingDuration } from '../src/formats/gpif/gpif-duration';
import { TRILL_TICKS_FACTOR } from '../src/formats/gpif/gpif-note';
import { EMPTY_NOTE_EFFECT } from '../src/model/defaults';
import type { Duration, Harmonic } from '../src/model/song';
import {
  accentFlagsOf,
  brushTicksOf,
  clefNameOf,
  dynamicNameOf,
  harmonicFretOf,
  noteValueNameOf,
  pitchOf,
  slideFlagsOf,
  tremoloPickingOf,
  trillTicksOf,
} from '../src/write/gpif/gpif-units';

describe('noteValueNameOf', () => {
  it.each([
    [1, 'Whole'],
    [2, 'Half'],
    [4, 'Quarter'],
    [8, 'Eighth'],
    [16, '16th'],
    [32, '32nd'],
    [64, '64th'],
  ] as const)('names %i as %s', (value, name) => {
    // Arrange / Act / Assert
    expect(noteValueNameOf(value)).toBe(name);
  });
});

describe('dynamicNameOf', () => {
  it.each([
    [15, 'PPP'],
    [31, 'PP'],
    [47, 'P'],
    [63, 'MP'],
    [79, 'MF'],
    [95, 'F'],
    [111, 'FF'],
    [127, 'FFF'],
    [0, 'PPP'],
    [100, 'F'],
    [103, 'FF'],
  ])('writes velocity %i as %s', (velocity, name) => {
    // Arrange / Act / Assert
    expect(dynamicNameOf(velocity)).toBe(name);
  });
});

describe('brushTicksOf', () => {
  it.each(STROKE_VALUES)('gives a brush duration the reader turns back into stroke value %i', (value) => {
    // Arrange / Act
    const ticks = brushTicksOf(value);

    // Assert
    expect(strokeValueFromTicks(ticks)).toBe(value);
  });
});

describe('trillTicksOf', () => {
  it.each([16, 32, 64, 8] as const)('gives back a %ith-note trill speed', (value) => {
    // Arrange
    const duration = plainDuration(value);

    // Act
    const ticks = trillTicksOf(duration);

    // Assert: the reader scales Guitar Pro's 480 ticks per quarter note to the song's
    expect(durationFromTicks(ticks * TRILL_TICKS_FACTOR)).toEqual(duration);
  });
});

describe('tremoloPickingOf', () => {
  it.each([
    [8, '1/2'],
    [16, '1/4'],
    [32, '1/8'],
    [4, '1/2'],
    [64, '1/8'],
  ] as const)('writes %ith notes as %s', (value, text) => {
    // Arrange
    const duration: Duration = plainDuration(value);

    // Act
    const written = tremoloPickingOf(duration);

    // Assert
    expect(written).toBe(text);
  });

  it.each([8, 16, 32] as const)('reads back the %ith-note speeds Guitar Pro has', (value) => {
    // Arrange / Act
    const read = tremoloPickingDuration(tremoloPickingOf(plainDuration(value)).split('/').map(Number));

    // Assert
    expect(read).toEqual(plainDuration(value));
  });
});

describe('harmonicFretOf', () => {
  it.each([
    [{ type: 'artificial', data: 12 }, 0, 12],
    [{ type: 'artificial', data: 19 }, 3, 7],
    [{ type: 'artificial', data: 28 }, 3, 9],
    [{ type: 'artificial', data: 0 }, 3, undefined],
    [{ type: 'artificial', data: 13 }, 3, undefined],
    [{ type: 'tapped', data: 17 }, 5, 12],
    [{ type: 'tapped', data: 5 }, 5, 0],
    [{ type: 'tapped', data: 0 }, 5, undefined],
    [{ type: 'natural', data: 0 }, 7, 7],
    [{ type: 'pinch', data: 0 }, 2, 12],
    [{ type: 'semi', data: 0 }, 2, 12],
  ] as const)('writes %j on fret %i with harmonic fret %s', (harmonic: Harmonic, fret, expected) => {
    // Arrange / Act / Assert
    expect(harmonicFretOf(harmonic, fret)).toBe(expected);
  });

  it('finds the harmonic fret of every artificial offset in the table', () => {
    // Arrange / Act / Assert
    expect([12, 28, 24, 19, 31].map(harmonicFretAtOffset)).toEqual([12, 9, 5, 7, 3]);
    expect(harmonicFretAtOffset(1)).toBeUndefined();
  });
});

describe('note and beat flags', () => {
  it('combines slides as GPIF flags', () => {
    // Arrange / Act / Assert
    expect(slideFlagsOf(['shift', 'intoFromBelow'])).toBe(0x11);
    expect(slideFlagsOf(['legato', 'outDownwards', 'outUpwards', 'intoFromAbove'])).toBe(0x2e);
    expect(slideFlagsOf([])).toBe(0);
  });

  it('combines staccato and accents as the Accent value', () => {
    // Arrange / Act / Assert
    expect(accentFlagsOf({ ...EMPTY_NOTE_EFFECT, staccato: true, accentuatedNote: true })).toBe(0x09);
    expect(accentFlagsOf({ ...EMPTY_NOTE_EFFECT, heavyAccentuatedNote: true })).toBe(0x04);
    expect(accentFlagsOf(EMPTY_NOTE_EFFECT)).toBe(0);
  });

  it.each([
    ['treble', 'G2'],
    ['bass', 'F4'],
    ['alto', 'C3'],
    ['tenor', 'C4'],
    ['neutral', 'Neutral'],
  ] as const)('names the %s clef %s', (clef, name) => {
    // Arrange / Act / Assert
    expect(clefNameOf(clef)).toBe(name);
  });
});

describe('pitchOf', () => {
  it('spells a pitch with sharps in sharp keys and with flats in flat keys, octave 5 from middle C', () => {
    // Arrange / Act / Assert
    expect(pitchOf(60, 0)).toEqual({ step: 'C', accidental: '', octave: 5 });
    expect(pitchOf(61, 2)).toEqual({ step: 'C', accidental: '#', octave: 5 });
    expect(pitchOf(61, -3)).toEqual({ step: 'D', accidental: 'b', octave: 5 });
    expect(pitchOf(40, 0)).toEqual({ step: 'E', accidental: '', octave: 3 });
  });
});
