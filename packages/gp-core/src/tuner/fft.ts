// Radix-2 FFT in place of craigl.spectrumanalyzer.FFT (Jef Poskanzer's libfft) used by TuxGuitar's TGTuner: the same
// forward transform scaled by 1/n, with the bit reversal and twiddle factors computed once per size, not per butterfly.

import { TunerError } from '../errors';

/** The largest transform: a 16384-sample frame padded twice (the tuner's frames are far shorter). */
export const MAX_FFT_SIZE = 32768;

export interface ComplexSpectrum {
  readonly re: Float64Array;
  readonly im: Float64Array;
}

interface Twiddles {
  readonly cos: Float64Array;
  readonly sin: Float64Array;
  /** Bit-reversed index of each position. */
  readonly reversed: Uint32Array;
}

const twiddleCache = new Map<number, Twiddles>();

function isPowerOfTwo(size: number): boolean {
  return Number.isInteger(size) && size >= 2 && size <= MAX_FFT_SIZE && (size & (size - 1)) === 0;
}

function buildTwiddles(size: number): Twiddles {
  const half = size / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / size);
    sin[k] = -Math.sin((2 * Math.PI * k) / size);
  }
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let bit = 0, rest = i; bit < bits; bit++, rest >>= 1) {
      r = (r << 1) | (rest & 1);
    }
    reversed[i] = r;
  }
  return { cos, sin, reversed };
}

function twiddlesFor(size: number): Twiddles {
  const cached = twiddleCache.get(size);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildTwiddles(size);
  twiddleCache.set(size, built);
  return built;
}

/** Decimation in time on buffers this module owns. */
function transformInPlace(re: Float64Array, im: Float64Array, { cos, sin, reversed }: Twiddles): void {
  const size = re.length;
  for (let i = 0; i < size; i++) {
    const j = reversed[i] ?? i;
    if (j > i) {
      const r = re[i] ?? 0;
      const m = im[i] ?? 0;
      re[i] = re[j] ?? 0;
      im[i] = im[j] ?? 0;
      re[j] = r;
      im[j] = m;
    }
  }
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const step = size / span;
    for (let start = 0; start < size; start += span) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step] ?? 1;
        const wi = sin[k * step] ?? 0;
        const p = start + k;
        const q = p + half;
        const qr = re[q] ?? 0;
        const qi = im[q] ?? 0;
        const tr = qr * wr - qi * wi;
        const ti = qr * wi + qi * wr;
        const pr = re[p] ?? 0;
        const pi = im[p] ?? 0;
        re[q] = pr - tr;
        im[q] = pi - ti;
        re[p] = pr + tr;
        im[p] = pi + ti;
      }
    }
  }
}

function checkSize(size: number, imaginarySize: number): void {
  if (!isPowerOfTwo(size) || imaginarySize !== size) {
    throw new TunerError(`FFT needs real and imaginary parts of one power-of-two length up to ${MAX_FFT_SIZE} (got ${size} and ${imaginarySize})`);
  }
}

/** Forward FFT of (re, im), scaled by 1/n as FFT.java does. Returns new arrays; the input is left as it was. */
export function fft(re: Float64Array, im: Float64Array): ComplexSpectrum {
  checkSize(re.length, im.length);
  const outRe = Float64Array.from(re);
  const outIm = Float64Array.from(im);
  transformInPlace(outRe, outIm, twiddlesFor(re.length));
  const scale = 1 / re.length;
  for (let k = 0; k < re.length; k++) {
    outRe[k] = (outRe[k] ?? 0) * scale;
    outIm[k] = (outIm[k] ?? 0) * scale;
  }
  return { re: outRe, im: outIm };
}

/** |X[k]| (scaled by 1/n) for k = 0 … size/2 of real samples zero-padded to `size`, a power of two. */
export function magnitudeSpectrum(samples: ArrayLike<number>, size: number): Float64Array {
  checkSize(size, size);
  if (samples.length > size) {
    throw new TunerError(`A frame of ${samples.length} samples does not fit a ${size}-point FFT`);
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(samples);
  transformInPlace(re, im, twiddlesFor(size));
  const magnitudes = new Float64Array(size / 2 + 1);
  for (let k = 0; k < magnitudes.length; k++) {
    const r = re[k] ?? 0;
    const i = im[k] ?? 0;
    magnitudes[k] = Math.sqrt(r * r + i * i) / size;
  }
  return magnitudes;
}
