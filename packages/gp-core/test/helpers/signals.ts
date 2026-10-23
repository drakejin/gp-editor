// Synthetic tuner input: one frame of mono samples in [-1, 1], as the app's microphone capture sends them.

/** The app's frame: 2048 samples at 6 kHz (48 kHz decimated by 8), about a third of a second. */
export const FRAME_LENGTH = 2048;
export const SAMPLE_RATE = 6000;

/** E1 (low E of a bass) to E6 (fret 24 of a guitar's high E), in semitones from MIDI note 28. */
export const E1 = 28;
export const E6 = 88;

/** Equal-tempered frequency of a MIDI note at A4 = 440 Hz. */
export function frequencyOf(note: number, a4 = 440): number {
  return a4 * 2 ** ((note - 69) / 12);
}

/** Cents from `expected` to `actual`. */
export function centsBetween(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

/** A small seeded generator (mulberry32), so noisy signals are the same on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Overtone {
  /** Multiple of the fundamental (1 = the fundamental itself); may be fractional for a stiff string. */
  readonly ratio: number;
  readonly amplitude: number;
  readonly phase?: number;
}

/** Sum of sinusoids at `frequency` × each partial's ratio; partials at or above Nyquist are left out. */
export function partials(frequency: number, parts: readonly Overtone[], length = FRAME_LENGTH, sampleRate = SAMPLE_RATE): Float64Array {
  const out = new Float64Array(length);
  for (const part of parts.filter((candidate) => frequency * candidate.ratio < sampleRate / 2)) {
    const step = (2 * Math.PI * frequency * part.ratio) / sampleRate;
    const phase = part.phase ?? 0;
    for (let i = 0; i < length; i++) {
      out[i] = (out[i] ?? 0) + part.amplitude * Math.sin(step * i + phase);
    }
  }
  return out;
}

export function sine(frequency: number, amplitude = 0.5, length = FRAME_LENGTH, sampleRate = SAMPLE_RATE): Float64Array {
  return partials(frequency, [{ ratio: 1, amplitude }], length, sampleRate);
}

/** A band-limited sawtooth: every harmonic below Nyquist at 1/k of the fundamental. */
export function sawtooth(frequency: number, amplitude = 0.4, length = FRAME_LENGTH, sampleRate = SAMPLE_RATE): Float64Array {
  const count = Math.floor(sampleRate / 2 / frequency);
  const parts = Array.from({ length: count }, (_, k) => ({ ratio: k + 1, amplitude: amplitude / (k + 1) }));
  return partials(frequency, parts, length, sampleRate);
}

/**
 * A plucked string as a laptop microphone hears it: a weak fundamental under a strong 2nd and 3rd harmonic, a few
 * more partials slightly sharp (string stiffness), random phases, and white noise 30 dB under the tone.
 */
export function guitarLike(frequency: number, seed = 1, length = FRAME_LENGTH, sampleRate = SAMPLE_RATE): Float64Array {
  const random = seededRandom(seed);
  const amplitudes = [0.12, 0.3, 0.22, 0.12, 0.08, 0.05, 0.03];
  const stiffness = 0.00008;
  const parts = amplitudes.map((amplitude, k) => {
    const n = k + 1;
    return { ratio: n * Math.sqrt(1 + stiffness * n * n), amplitude, phase: random() * 2 * Math.PI };
  });
  const tone = partials(frequency, parts, length, sampleRate);
  return addNoise(tone, 0.006, seed + 1);
}

/** White noise of the given RMS added to a signal. */
export function addNoise(signal: Float64Array, rms: number, seed: number): Float64Array {
  const random = seededRandom(seed);
  // Uniform noise in [-a, a] has an RMS of a / √3.
  const peak = rms * Math.sqrt(3);
  return signal.map((sample) => sample + (random() * 2 - 1) * peak);
}

export function whiteNoise(rms: number, seed = 7, length = FRAME_LENGTH): Float64Array {
  return addNoise(new Float64Array(length), rms, seed);
}
