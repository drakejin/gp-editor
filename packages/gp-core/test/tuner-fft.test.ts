import { describe, expect, it } from 'vitest';
import { TunerError } from '../src/errors';
import { fft, magnitudeSpectrum } from '../src/tuner/fft';
import { seededRandom, sine } from './helpers/signals';

/** The textbook DFT, scaled by 1/n like the FFT. */
function slowDft(re: readonly number[], im: readonly number[]): { re: number[]; im: number[] } {
  const n = re.length;
  const out = { re: [] as number[], im: [] as number[] };
  for (let k = 0; k < n; k++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      sumRe += (re[t] ?? 0) * Math.cos(angle) - (im[t] ?? 0) * Math.sin(angle);
      sumIm += (re[t] ?? 0) * Math.sin(angle) + (im[t] ?? 0) * Math.cos(angle);
    }
    out.re.push(sumRe / n);
    out.im.push(sumIm / n);
  }
  return out;
}

describe('fft', () => {
  it('matches the textbook DFT on random complex input', () => {
    // Arrange
    const random = seededRandom(3);
    const re = Array.from({ length: 32 }, () => random() * 2 - 1);
    const im = Array.from({ length: 32 }, () => random() * 2 - 1);

    // Act
    const fast = fft(Float64Array.from(re), Float64Array.from(im));
    const slow = slowDft(re, im);

    // Assert
    slow.re.forEach((value, k) => expect(fast.re[k]).toBeCloseTo(value, 12));
    slow.im.forEach((value, k) => expect(fast.im[k]).toBeCloseTo(value, 12));
  });

  it('leaves its input untouched', () => {
    // Arrange
    const re = Float64Array.from([1, 2, 3, 4]);
    const im = new Float64Array(4);

    // Act
    fft(re, im);

    // Assert
    expect([...re]).toEqual([1, 2, 3, 4]);
    expect([...im]).toEqual([0, 0, 0, 0]);
  });

  it('refuses a length that is not a power of two, or real and imaginary parts of different lengths', () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow(TunerError);
    expect(() => fft(new Float64Array(16), new Float64Array(8))).toThrow(TunerError);
  });
});

describe('magnitudeSpectrum', () => {
  it('puts a sine exactly on a bin into that bin', () => {
    // Arrange: bin 64 of a 1024-point transform at 1024 Hz is 64 Hz.
    const samples = sine(64, 0.5, 1024, 1024);

    // Act
    const spectrum = magnitudeSpectrum(samples, 1024);

    // Assert: half the bins (up to Nyquist) and the peak where the sine is.
    expect(spectrum).toHaveLength(513);
    const peak = spectrum.indexOf(Math.max(...spectrum));
    expect(peak).toBe(64);
  });

  it('zero-pads a shorter frame to the transform size', () => {
    // Arrange: 512 samples of a 32 Hz sine at 1024 Hz, padded to 2048 points: the peak moves to bin 64.
    const samples = sine(32, 0.5, 512, 1024);

    // Act
    const spectrum = magnitudeSpectrum(samples, 2048);

    // Assert
    expect(spectrum).toHaveLength(1025);
    expect(spectrum.indexOf(Math.max(...spectrum))).toBe(64);
  });

  it('refuses a frame longer than the transform', () => {
    expect(() => magnitudeSpectrum(new Float64Array(2048), 1024)).toThrow(TunerError);
  });
});
