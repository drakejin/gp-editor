import { bytesToBase64 } from '../src/lib/base64';

/** Samples as GPAudioInput sends them: little-endian 16-bit PCM in base64. */
export function pcmBase64(samples: readonly number[]): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return bytesToBase64(bytes);
}

/** An "audioFrame" event body: a sine at half scale, 2048 samples at 6 kHz (or silence at 0 Hz). */
export function sineFrameEvent(frequency: number): { readonly sampleRate: number; readonly samples: string } {
  const samples = Array.from({ length: 2048 }, (_, i) => Math.round(16384 * Math.sin((2 * Math.PI * frequency * i) / 6000)));
  return { sampleRate: 6000, samples: pcmBase64(samples) };
}
