// Windows twin of audio-input.ts: the tuner's microphone through getUserMedia, shaped as GPAudioInput.m shapes it —
// mono, low-passed and decimated to about 6 kHz, the last 2048 samples sent every 512 new ones (about 12 times a
// second) as an "audioFrame" event { sampleRate, samples: little-endian 16-bit PCM in base64 }.
import { bytesToBase64 } from '../lib/base64';
import { onAppEvent, postAppEvent } from './web/app-events';
import { NativeError } from './web/tauri';

const TARGET_RATE = 6000;
const FRAME_LENGTH = 2048;
const FRAME_HOP = 512;
/** Under Nyquist of the decimated rate, over the tuner's search range (up to 2 kHz). */
const LOW_PASS_HZ = 2600;
const BLOCK_SIZE = 4096;

interface Capture {
  readonly context: AudioContext;
  readonly stream: MediaStream;
  readonly processor: ScriptProcessorNode;
}

let capture: Capture | undefined;
let starting: Promise<void> | undefined;

function frameBody(frame: Float32Array, sampleRate: number): { sampleRate: number; samples: string } {
  const pcm = new DataView(new ArrayBuffer(frame.length * 2));
  frame.forEach((sample, i) => pcm.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return { sampleRate, samples: bytesToBase64(new Uint8Array(pcm.buffer)) };
}

/** Keeps the last FRAME_LENGTH decimated samples and posts them every FRAME_HOP new ones. */
function framer(sampleRate: number, factor: number): (input: Float32Array) => void {
  // A ring of the last FRAME_LENGTH samples; `next` is where the next one goes (and the oldest one is).
  const ring = new Float32Array(FRAME_LENGTH);
  let next = 0;
  let filled = 0;
  let sinceLast = 0;
  let phase = 0;
  return (input) => {
    for (; phase < input.length; phase += factor) {
      ring[next] = input[phase] ?? 0;
      next = (next + 1) % FRAME_LENGTH;
      filled = Math.min(FRAME_LENGTH, filled + 1);
      sinceLast += 1;
      if (filled === FRAME_LENGTH && sinceLast >= FRAME_HOP) {
        sinceLast = 0;
        const frame = new Float32Array(FRAME_LENGTH);
        frame.set(ring.subarray(next), 0);
        frame.set(ring.subarray(0, next), FRAME_LENGTH - next);
        postAppEvent('audioFrame', frameBody(frame, sampleRate / factor));
      }
    }
    phase -= input.length;
  };
}

function startError(error: unknown): NativeError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new NativeError('Microphone access is off.', 'denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new NativeError('No microphone was found.', 'no_input');
  }
  return new NativeError(error instanceof Error ? error.message : 'The microphone could not start.', 'start_failed');
}

async function startCapture(): Promise<void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (error) {
    throw startError(error);
  }
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  // Two second-order low-passes in series, before keeping every factor-th sample.
  const first = new BiquadFilterNode(context, { type: 'lowpass', frequency: LOW_PASS_HZ, Q: Math.SQRT1_2 });
  const second = new BiquadFilterNode(context, { type: 'lowpass', frequency: LOW_PASS_HZ, Q: Math.SQRT1_2 });
  const processor = context.createScriptProcessor(BLOCK_SIZE, 1, 1);
  const factor = Math.max(1, Math.floor(context.sampleRate / TARGET_RATE));
  const push = framer(context.sampleRate, factor);
  processor.onaudioprocess = (event) => push(event.inputBuffer.getChannelData(0));
  source.connect(first).connect(second).connect(processor);
  // A script processor only runs when connected onward; it writes silence.
  processor.connect(context.destination);
  capture = { context, stream, processor };
}

/** Starts capture, asking for microphone access the first time; rejects with code "denied" when access is off. */
export function startAudioInput(): Promise<void> {
  if (capture !== undefined) {
    return Promise.resolve();
  }
  starting ??= startCapture().finally(() => {
    starting = undefined;
  });
  return starting;
}

export async function stopAudioInput(): Promise<void> {
  const running = capture;
  capture = undefined;
  if (running === undefined) {
    return;
  }
  running.processor.onaudioprocess = null;
  running.stream.getTracks().forEach((track) => track.stop());
  await running.context.close();
}

export function subscribeAudioFrames(onFrame: (body: unknown) => void): () => void {
  return onAppEvent('audioFrame', onFrame);
}

/** Tools ▸ Tuner…. */
export function subscribeTunerRequests(onTunerRequested: () => void): () => void {
  return onAppEvent('tunerRequested', () => onTunerRequested());
}
