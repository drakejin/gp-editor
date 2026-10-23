import { MAX_FRAME_LENGTH, MIN_FRAME_LENGTH, type QueuedFrequency, SILENCE_DB, TunerError, detectPitch, pushFrequency, stableFrequency } from '@gp-editor/core';
import { base64ToBytes } from './base64';

/** One frame of microphone samples, as GPAudioInput sends it once decoded: mono, in -1 … 1. */
export interface AudioFrame {
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

/** What the tuner has heard: the last frame's level, the last frames' pitches and the pitch they agree on. */
export interface TunerInput {
  readonly levelDb: number;
  readonly queue: readonly QueuedFrequency[];
  readonly frequency?: number;
}

export const SILENT_INPUT: TunerInput = { levelDb: SILENCE_DB, queue: [] };

/** The microphone: being started, sending frames, refused by the user (System Settings), or failed otherwise. */
export type TunerStatus =
  | { readonly kind: 'starting' }
  | { readonly kind: 'listening' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'failed'; readonly message: string };

const MIN_SAMPLE_RATE = 1000;
const MAX_SAMPLE_RATE = 192000;
const BYTES_PER_SAMPLE = 2;
const PCM_SCALE = 32768;
/** Base64 holds 3 bytes in 4 characters; a longer string cannot be a frame the detector takes. */
const MAX_BASE64_LENGTH = Math.ceil((MAX_FRAME_LENGTH * BYTES_PER_SAMPLE) / 3) * 4;

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function decodeBase64(base64: string): Uint8Array | undefined {
  try {
    return base64ToBytes(base64);
  } catch {
    return undefined;
  }
}

/**
 * A frame event of GPAudioInput (`{ sampleRate, samples }`, the samples as little-endian 16-bit PCM in base64), checked:
 * undefined for anything else, or for a frame the pitch detector would refuse.
 */
export function parseAudioFrame(body: unknown): AudioFrame | undefined {
  if (!isObject(body) || typeof body.sampleRate !== 'number' || typeof body.samples !== 'string') {
    return undefined;
  }
  const { sampleRate, samples } = body;
  if (!(sampleRate >= MIN_SAMPLE_RATE && sampleRate <= MAX_SAMPLE_RATE) || samples.length > MAX_BASE64_LENGTH) {
    return undefined;
  }
  const bytes = decodeBase64(samples);
  const count = bytes === undefined ? 0 : bytes.length / BYTES_PER_SAMPLE;
  if (bytes === undefined || !Number.isInteger(count) || count < MIN_FRAME_LENGTH || count > MAX_FRAME_LENGTH) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoded = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    decoded[i] = view.getInt16(i * BYTES_PER_SAMPLE, true) / PCM_SCALE;
  }
  return { sampleRate, samples: decoded };
}

/** The input after one more frame event: its level, and its pitch voted on with the last frames'. */
export function nextTunerInput(input: TunerInput, body: unknown): TunerInput {
  const frame = parseAudioFrame(body);
  if (frame === undefined) {
    return input;
  }
  try {
    const detection = detectPitch(frame.samples, frame.sampleRate);
    const queue = pushFrequency(input.queue, detection.frequency);
    return { levelDb: detection.levelDb, queue, frequency: stableFrequency(queue) };
  } catch (error) {
    if (error instanceof TunerError) {
      return input;
    }
    throw error;
  }
}
