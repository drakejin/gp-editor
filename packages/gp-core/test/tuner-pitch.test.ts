import { describe, expect, it } from 'vitest';
import { TunerError } from '../src/errors';
import { DEFAULT_GATE_DB, MAX_FRAME_LENGTH, MIN_FRAME_LENGTH, detectPitch } from '../src/tuner/pitch-detector';
import { E1, E6, FRAME_LENGTH, SAMPLE_RATE, addNoise, centsBetween, frequencyOf, guitarLike, partials, sawtooth, sine, whiteNoise } from './helpers/signals';

/** Every semitone from E1 (41.2 Hz) to E6 (1318.5 Hz), plus a quarter-tone-off frequency between each pair. */
const NOTES = Array.from({ length: E6 - E1 + 1 }, (_, i) => E1 + i);
const FREQUENCIES = NOTES.flatMap((note) => [frequencyOf(note), frequencyOf(note + 0.37)]).filter((f) => f <= frequencyOf(E6));

function detectedCents(samples: Float64Array, expected: number, sampleRate = SAMPLE_RATE): number {
  const { frequency } = detectPitch(samples, sampleRate);
  if (frequency === undefined) {
    throw new Error(`no pitch detected for ${expected.toFixed(2)} Hz`);
  }
  return centsBetween(frequency, expected);
}

function worstCents(signal: (frequency: number) => Float64Array): number {
  return Math.max(...FREQUENCIES.map((frequency) => Math.abs(detectedCents(signal(frequency), frequency))));
}

describe('detectPitch on clean tones from E1 to E6', () => {
  it('reads a sine within 2 cents', () => {
    expect(worstCents((frequency) => sine(frequency))).toBeLessThan(2);
  });

  it('reads a sawtooth (every harmonic, the fundamental strongest) within 2 cents', () => {
    expect(worstCents((frequency) => sawtooth(frequency))).toBeLessThan(2);
  });

  it('reads a guitar-like tone with a weak fundamental and noise within 2 cents, not an octave high', () => {
    expect(worstCents((frequency) => guitarLike(frequency, Math.round(frequency)))).toBeLessThan(2);
  });

  it('reads the same at 44.1 kHz decimated by 7 (6300 Hz) and at 12 kHz', () => {
    // Arrange
    const low = frequencyOf(E1);
    const high = frequencyOf(E6);

    // Act: the same third of a second at each rate.
    const cents = [6300, 12000].flatMap((sampleRate) => {
      const length = Math.round(FRAME_LENGTH * (sampleRate / SAMPLE_RATE));
      return [
        detectedCents(guitarLike(low, 5, length, sampleRate), low, sampleRate),
        detectedCents(sawtooth(high, 0.4, length, sampleRate), high, sampleRate),
      ];
    });

    // Assert
    cents.forEach((value) => expect(Math.abs(value)).toBeLessThan(2));
  });
});

describe('detectPitch harmonic check', () => {
  it('reads the fundamental when the 3rd harmonic is the strongest partial', () => {
    // Arrange: A2 with partials 1 : 2 : 3 at 0.15 : 0.4 : 1.
    const frequency = 110;
    const samples = partials(frequency, [
      { ratio: 1, amplitude: 0.05 },
      { ratio: 2, amplitude: 0.12 },
      { ratio: 3, amplitude: 0.3 },
      { ratio: 4, amplitude: 0.06 },
    ]);

    // Act
    const cents = detectedCents(samples, frequency);

    // Assert
    expect(Math.abs(cents)).toBeLessThan(2);
  });

  it('reads two sines an octave apart as the lower one, and a lone sine as itself', () => {
    // Arrange
    const octave = partials(196, [
      { ratio: 1, amplitude: 0.1 },
      { ratio: 2, amplitude: 0.4 },
    ]);

    // Act
    const octaveReading = detectPitch(octave, SAMPLE_RATE).frequency ?? 0;
    const loneReading = detectPitch(sine(392), SAMPLE_RATE).frequency ?? 0;

    // Assert
    expect(Math.abs(centsBetween(octaveReading, 196))).toBeLessThan(2);
    expect(Math.abs(centsBetween(loneReading, 392))).toBeLessThan(2);
  });
});

describe('detectPitch noise gate', () => {
  it('reads nothing from a tone under the gate, but reports its level', () => {
    // Arrange: a sine at amplitude 0.0005 is about -69 dBFS RMS.
    const quiet = sine(110, 0.0005);

    // Act
    const detection = detectPitch(quiet, SAMPLE_RATE);

    // Assert
    expect(detection.frequency).toBeUndefined();
    expect(detection.levelDb).toBeCloseTo(20 * Math.log10(0.0005 / Math.SQRT2), 1);
    expect(detection.levelDb).toBeLessThan(DEFAULT_GATE_DB);
  });

  it('reads nothing from silence or from loud white noise', () => {
    expect(detectPitch(new Float64Array(FRAME_LENGTH), SAMPLE_RATE)).toEqual({ levelDb: -120 });
    expect(detectPitch(whiteNoise(0.1), SAMPLE_RATE).frequency).toBeUndefined();
  });

  it('reads a tone over a noise floor once it is over the gate, and follows a stricter gate', () => {
    // Arrange: a quiet A2 over noise 20 dB under it.
    const samples = addNoise(sine(110, 0.01), 0.0007, 11);

    // Act
    const loose = detectPitch(samples, SAMPLE_RATE);
    const strict = detectPitch(samples, SAMPLE_RATE, { gateDb: -30 });

    // Assert
    expect(Math.abs(centsBetween(loose.frequency ?? 0, 110))).toBeLessThan(2);
    expect(strict.frequency).toBeUndefined();
  });

  it('ignores a DC offset', () => {
    // Arrange
    const samples = sine(82.41).map((sample) => sample + 0.3);

    // Act
    const { frequency } = detectPitch(samples, SAMPLE_RATE);

    // Assert
    expect(Math.abs(centsBetween(frequency ?? 0, 82.41))).toBeLessThan(2);
  });
});

describe('detectPitch search range', () => {
  it('reads nothing outside the range it is given', () => {
    expect(detectPitch(sine(110), SAMPLE_RATE, { minFrequency: 200, maxFrequency: 1000 }).frequency).toBeUndefined();
    expect(detectPitch(sine(3000), SAMPLE_RATE).frequency).toBeUndefined();
  });
});

describe('detectPitch input checks', () => {
  it('refuses a sample rate that is not a positive number', () => {
    expect(() => detectPitch(sine(110), 0)).toThrow(TunerError);
    expect(() => detectPitch(sine(110), Number.NaN)).toThrow(TunerError);
  });

  it('refuses a frame too short to hold a low E or too long to analyse at the frame rate', () => {
    expect(() => detectPitch(new Float64Array(MIN_FRAME_LENGTH - 1), SAMPLE_RATE)).toThrow(TunerError);
    expect(() => detectPitch(new Float64Array(MAX_FRAME_LENGTH + 1), SAMPLE_RATE)).toThrow(TunerError);
  });

  it('refuses a search range that is empty or above Nyquist', () => {
    expect(() => detectPitch(sine(110), SAMPLE_RATE, { minFrequency: 500, maxFrequency: 400 })).toThrow(TunerError);
    expect(() => detectPitch(sine(110), SAMPLE_RATE, { maxFrequency: 7000 })).toThrow(TunerError);
  });

  it('treats samples that are not numbers as silence', () => {
    // Arrange: every other sample lost; zeroing them leaves the tone (and an image near Nyquist, out of range).
    const samples = sine(110).map((sample, i) => (i % 2 === 0 ? sample : Number.NaN));

    // Act
    const detection = detectPitch(samples, SAMPLE_RATE);

    // Assert
    expect(Number.isFinite(detection.levelDb)).toBe(true);
    expect(Math.abs(centsBetween(detection.frequency ?? 0, 110))).toBeLessThan(2);
  });
});
