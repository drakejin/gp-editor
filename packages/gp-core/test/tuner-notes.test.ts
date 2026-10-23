import { describe, expect, it } from 'vitest';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../src/model/defaults';
import {
  DEFAULT_REFERENCE_A4,
  MAX_REFERENCE_A4,
  MIN_REFERENCE_A4,
  clampReferenceA4,
  frequencyFromNote,
  nearestNote,
  nearestString,
  pitchFromFrequency,
  toTunerReading,
} from '../src/tuner/notes';

describe('frequencyFromNote and pitchFromFrequency', () => {
  it('puts A4 at the reference and A2 two octaves under it, as TGTuner.getNoteFrequency does', () => {
    expect(frequencyFromNote(69)).toBe(440);
    expect(frequencyFromNote(45)).toBeCloseTo(110, 10);
    expect(frequencyFromNote(69, 432)).toBe(432);
    expect(frequencyFromNote(40)).toBeCloseTo(82.4069, 3);
  });

  it('turns a frequency back into a fractional MIDI note', () => {
    expect(pitchFromFrequency(110)).toBeCloseTo(45, 10);
    expect(pitchFromFrequency(440 * 2 ** (0.25 / 12))).toBeCloseTo(69.25, 10);
    expect(pitchFromFrequency(415, 415)).toBeCloseTo(69, 10);
  });
});

describe('nearestNote', () => {
  it('names the nearest equal-tempered note and how many cents the frequency is off it', () => {
    // Arrange: 112 Hz is 31 cents sharp of A2 (110 Hz).
    // Act
    const sharp = nearestNote(112);
    const inTune = nearestNote(329.63);

    // Assert
    expect(sharp.note).toBe(45);
    expect(sharp.cents).toBeCloseTo(31.2, 1);
    expect(inTune.note).toBe(64);
    expect(Math.abs(inTune.cents)).toBeLessThan(0.1);
  });

  it('keeps the cents within -50 … +50', () => {
    // Arrange: 49 cents flat of A#2 is 51 cents sharp of A2: the nearest note is A#2.
    const frequency = frequencyFromNote(46) * 2 ** (-49 / 1200);

    // Act
    const reading = nearestNote(frequency);

    // Assert
    expect(reading.note).toBe(46);
    expect(reading.cents).toBeCloseTo(-49, 6);
  });

  it('follows the reference A4', () => {
    // Arrange: 415 Hz is A4 at baroque pitch, but 100 cents flat of A4 = 440 (G#4).
    // Act
    const baroque = nearestNote(415, 415);
    const modern = nearestNote(415);

    // Assert
    expect(baroque.note).toBe(69);
    expect(Math.abs(baroque.cents)).toBeLessThan(1e-9);
    expect(modern.note).toBe(68);
    expect(modern.cents).toBeCloseTo(-1.3, 0);
  });
});

describe('nearestString', () => {
  it('finds the open string nearest the frequency, numbered from 1 = the highest', () => {
    // Arrange: 112 Hz is near the A string (110 Hz), string 5 of standard tuning.
    // Act
    const reading = nearestString(112, STANDARD_TUNING);

    // Assert
    expect(reading).toEqual({ index: 4, number: 5, note: 45, cents: expect.closeTo(31.2, 1) as number });
  });

  it('can be more than half a semitone off when the note falls between strings', () => {
    // Arrange: C3 (130.8 Hz) lies 3 semitones over the A string and 2 under the D string.
    // Act
    const reading = nearestString(frequencyFromNote(48), STANDARD_TUNING);

    // Assert
    expect(reading?.number).toBe(4);
    expect(reading?.cents).toBeCloseTo(-200, 6);
  });

  it('uses the bass strings for a bass tuning, and gives nothing for a track without strings', () => {
    expect(nearestString(41.2, STANDARD_BASS_TUNING)?.number).toBe(4);
    expect(nearestString(41.2, [])).toBeUndefined();
  });
});

describe('toTunerReading', () => {
  it('gathers the frequency, the nearest note with its cents and the nearest string', () => {
    // Act
    const reading = toTunerReading(329.63, STANDARD_TUNING);

    // Assert
    expect(reading.frequency).toBe(329.63);
    expect(reading.note).toBe(64);
    expect(reading.string?.number).toBe(1);
    expect(Math.abs(reading.string?.cents ?? 99)).toBeLessThan(0.1);
  });
});

describe('clampReferenceA4', () => {
  it('keeps the reference between 415 and 466 Hz, and falls back to 440 for a value that is not a number', () => {
    expect(DEFAULT_REFERENCE_A4).toBe(440);
    expect(clampReferenceA4(400)).toBe(MIN_REFERENCE_A4);
    expect(clampReferenceA4(500)).toBe(MAX_REFERENCE_A4);
    expect(clampReferenceA4(442)).toBe(442);
    expect(clampReferenceA4(Number.NaN)).toBe(440);
  });
});
