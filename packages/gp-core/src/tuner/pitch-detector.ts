// Follows the analysis loop of TuxGuitar's TGTuner.run: one frame through an FFT, then the strongest bin between the
// lowest and highest frequency wanted, over a noise gate. Added here: DC removal and a Hann window, zero-padding, the
// peak's place between bins (a parabola through the log magnitudes of the peak and its neighbours), a harmonic check
// (the strongest peak may be the 2nd or 3rd harmonic of a weak fundamental — a guitar through a laptop microphone),
// and a tonality check (noise has no peak standing far over the rest of the band).

import { TunerError } from '../errors';
import { MAX_FFT_SIZE, magnitudeSpectrum } from './fft';

/** Shorter frames hold too few cycles of a low E to place it within a few cents. */
export const MIN_FRAME_LENGTH = 1024;
export const MAX_FRAME_LENGTH = MAX_FFT_SIZE / 2;
/** RMS level under which a frame is not analysed (a quiet room through a laptop microphone is about -60 dBFS). */
export const DEFAULT_GATE_DB = -55;
/** Just under B0, the low string of a 5-string bass. */
export const DEFAULT_MIN_FREQUENCY = 30;
/** Just over B6, past fret 24 of a guitar's high E. */
export const DEFAULT_MAX_FREQUENCY = 2000;
/** The level of a silent frame. */
export const SILENCE_DB = -120;

/** The FFT is twice the frame: finer bins for the interpolation. */
const ZERO_PADDING = 2;
/** A peak under the strongest one counts as its fundamental when it reaches this share of it. */
const FUNDAMENTAL_SHARE = 0.1;
/** Harmonics of a fundamental tried under the strongest peak, the highest first. */
const MAX_HARMONIC = 5;
/** How far a harmonic may sit from n × the fundamental (string stiffness, bin rounding), as a share of its frequency. */
const HARMONIC_TOLERANCE = 0.03;
/** Fundamental searches under a found fundamental (a 6th harmonic → the 2nd → the fundamental). */
const MAX_FUNDAMENTAL_STEPS = 3;
/** The strongest peak must stand this many times over the band's mean magnitude; white noise reaches about 4. */
const MIN_PEAK_TO_MEAN = 10;
/** The magnitude a sine of RMS 1 makes in an unpadded spectrum: amplitude √2, halved (one side), × the Hann gain ½. */
const SINE_PEAK_PER_RMS = Math.SQRT2 * 0.5 * 0.5;
/** The strongest peak must hold this share of what a sine as loud as the frame would make; a tone out of range only
 * leaks a far smaller share into the band. */
const MIN_TONE_SHARE = 0.1;

export interface PitchDetectorOptions {
  readonly minFrequency?: number;
  readonly maxFrequency?: number;
  /** RMS level in dBFS a frame must reach to be analysed. */
  readonly gateDb?: number;
}

export interface PitchDetection {
  /** RMS level of the frame in dBFS (SILENCE_DB for silence). */
  readonly levelDb: number;
  /** The fundamental in Hz; undefined under the gate or when the frame holds no clear tone. */
  readonly frequency?: number;
}

interface BinRange {
  readonly low: number;
  readonly high: number;
}

function checkInput(length: number, sampleRate: number, minFrequency: number, maxFrequency: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new TunerError(`Sample rate must be a positive number of Hz (got ${sampleRate})`);
  }
  if (length < MIN_FRAME_LENGTH || length > MAX_FRAME_LENGTH) {
    throw new TunerError(`A tuner frame holds ${MIN_FRAME_LENGTH}–${MAX_FRAME_LENGTH} samples (got ${length})`);
  }
  if (!(minFrequency > 0 && minFrequency < maxFrequency && maxFrequency < sampleRate / 2)) {
    throw new TunerError(`Search range ${minFrequency}–${maxFrequency} Hz must be rising and under Nyquist (${sampleRate / 2} Hz)`);
  }
}

// Plain loops below, not map/reduce: a frame is analysed about ten times a second in Hermes, which has no JIT.

/** The samples less their mean; a sample that is not a number counts as silence. */
function removeDc(samples: ArrayLike<number>): Float64Array {
  const centred = new Float64Array(samples.length);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    centred[i] = Number.isFinite(sample) ? sample : 0;
    sum += centred[i] ?? 0;
  }
  const mean = sum / samples.length;
  for (let i = 0; i < centred.length; i++) {
    centred[i] = (centred[i] ?? 0) - mean;
  }
  return centred;
}

function rmsOf(samples: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function toDb(rms: number): number {
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
}

const hannCache = new Map<number, Float64Array>();

/** Periodic Hann window of a length, computed once. */
function hannWindow(length: number): Float64Array {
  const cached = hannCache.get(length);
  if (cached !== undefined) {
    return cached;
  }
  const window = Float64Array.from({ length }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / length)));
  hannCache.set(length, window);
  return window;
}

/** The samples, windowed (new array). */
function hann(samples: Float64Array): Float64Array {
  const window = hannWindow(samples.length);
  const windowed = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    windowed[i] = (samples[i] ?? 0) * (window[i] ?? 0);
  }
  return windowed;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function magnitudeAt(spectrum: Float64Array, bin: number): number {
  return spectrum[bin] ?? 0;
}

function isLocalPeak(spectrum: Float64Array, bin: number): boolean {
  const value = magnitudeAt(spectrum, bin);
  return value > 0 && value >= magnitudeAt(spectrum, bin - 1) && value >= magnitudeAt(spectrum, bin + 1);
}

/** TGTuner's search: the strongest bin of the band. Undefined unless it is a peak (not a slope from out of range). */
function strongestBin(spectrum: Float64Array, band: BinRange): number | undefined {
  let best = band.low;
  for (let bin = band.low + 1; bin <= band.high; bin++) {
    if (magnitudeAt(spectrum, bin) > magnitudeAt(spectrum, best)) {
      best = bin;
    }
  }
  return isLocalPeak(spectrum, best) ? best : undefined;
}

/**
 * Whether the peak is a tone of the band: far over the band's mean, and holding a fair share of `sinePeak`, the peak a
 * sine as loud as the whole frame would make.
 */
function isTonal(spectrum: Float64Array, band: BinRange, peak: number, sinePeak: number): boolean {
  let sum = 0;
  for (let bin = band.low; bin <= band.high; bin++) {
    sum += magnitudeAt(spectrum, bin);
  }
  const magnitude = magnitudeAt(spectrum, peak);
  return magnitude >= (MIN_PEAK_TO_MEAN * sum) / (band.high - band.low + 1) && magnitude >= MIN_TONE_SHARE * sinePeak;
}

/** The strongest local peak within `from` … `to`, or undefined. */
function peakBetween(spectrum: Float64Array, from: number, to: number): number | undefined {
  let best: number | undefined;
  for (let bin = from; bin <= to; bin++) {
    if (isLocalPeak(spectrum, bin) && (best === undefined || magnitudeAt(spectrum, bin) > magnitudeAt(spectrum, best))) {
      best = bin;
    }
  }
  return best;
}

/** A peak at bin / n (n = MAX_HARMONIC … 2, the lowest such fundamental first) reaching `floor`, or undefined. */
function fundamentalUnder(spectrum: Float64Array, bin: number, lowBin: number, floor: number): number | undefined {
  for (let harmonic = MAX_HARMONIC; harmonic >= 2; harmonic--) {
    const centre = bin / harmonic;
    const reach = Math.max(1, centre * HARMONIC_TOLERANCE);
    const found = peakBetween(spectrum, Math.max(lowBin, Math.floor(centre - reach)), Math.ceil(centre + reach));
    if (found !== undefined && magnitudeAt(spectrum, found) >= floor) {
      return found;
    }
  }
  return undefined;
}

function fundamentalBin(spectrum: Float64Array, peak: number, lowBin: number): number {
  const floor = magnitudeAt(spectrum, peak) * FUNDAMENTAL_SHARE;
  let bin = peak;
  for (let step = 0; step < MAX_FUNDAMENTAL_STEPS; step++) {
    const lower = fundamentalUnder(spectrum, bin, lowBin, floor);
    if (lower === undefined) {
      break;
    }
    bin = lower;
  }
  return bin;
}

/** The peak's place between bins: the vertex of the parabola through the log magnitudes around it. */
function interpolatedBin(spectrum: Float64Array, bin: number): number {
  const left = Math.log(magnitudeAt(spectrum, bin - 1) + Number.MIN_VALUE);
  const centre = Math.log(magnitudeAt(spectrum, bin) + Number.MIN_VALUE);
  const right = Math.log(magnitudeAt(spectrum, bin + 1) + Number.MIN_VALUE);
  const curvature = left - 2 * centre + right;
  if (!(curvature < 0)) {
    return bin;
  }
  const offset = (0.5 * (left - right)) / curvature;
  return bin + Math.max(-0.5, Math.min(0.5, offset));
}

/** The fundamental of a mono frame (samples in -1 … 1) and its level; see PitchDetection. */
export function detectPitch(samples: ArrayLike<number>, sampleRate: number, options: PitchDetectorOptions = {}): PitchDetection {
  const minFrequency = options.minFrequency ?? DEFAULT_MIN_FREQUENCY;
  const maxFrequency = options.maxFrequency ?? DEFAULT_MAX_FREQUENCY;
  checkInput(samples.length, sampleRate, minFrequency, maxFrequency);
  const centred = removeDc(samples);
  const rms = rmsOf(centred);
  const level = toDb(rms);
  if (level < (options.gateDb ?? DEFAULT_GATE_DB)) {
    return { levelDb: level };
  }
  const fftSize = nextPowerOfTwo(samples.length * ZERO_PADDING);
  const spectrum = magnitudeSpectrum(hann(centred), fftSize);
  const binHz = sampleRate / fftSize;
  const band = { low: Math.max(1, Math.ceil(minFrequency / binHz)), high: Math.min(spectrum.length - 2, Math.floor(maxFrequency / binHz)) };
  const peak = strongestBin(spectrum, band);
  const sinePeak = (SINE_PEAK_PER_RMS * rms * samples.length) / fftSize;
  if (peak === undefined || !isTonal(spectrum, band, peak, sinePeak)) {
    return { levelDb: level };
  }
  return { levelDb: level, frequency: interpolatedBin(spectrum, fundamentalBin(spectrum, peak, band.low)) * binHz };
}
