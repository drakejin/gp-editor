import type { FileFormat } from '../lib/file-formats';

/**
 * File ▸ Export Audio…'s formats and settings. The native side (macos/GPEditor-macOS/GPAudioFileWriter.m) writes WAV,
 * AIFF and FLAC with macOS's encoders, MP3 with LAME and Ogg Vorbis with libvorbis, and checks these values again.
 */

export type AudioFormatId = 'wav' | 'aiff' | 'flac' | 'mp3' | 'ogg';
export type SampleRate = 44100 | 48000;
export type BitDepth = 16 | 24;
/** An MP3's constant bit rate in kbps; 0 = variable (LAME's V2). */
export type Mp3Bitrate = 0 | 128 | 192 | 256 | 320;
/** Ogg Vorbis' quality (libvorbis' -q, 0–10). */
export type OggQuality = 4 | 6 | 8 | 10;
/** The whole song, or the loop's bars. */
export type AudioRange = 'song' | 'loop';

export interface AudioFormat extends FileFormat {
  readonly id: AudioFormatId;
  /** WAV, AIFF and FLAC keep every sample; MP3 and Ogg Vorbis leave out what is hard to hear. */
  readonly isLossless: boolean;
  /** Its name in texts: "WAV", "Ogg Vorbis". */
  readonly name: string;
}

export const AUDIO_FORMATS: readonly [AudioFormat, ...AudioFormat[]] = [
  { id: 'wav', name: 'WAV', label: 'WAV (.wav)', extension: 'wav', isLossless: true, note: 'Uncompressed PCM, for any audio program.' },
  { id: 'aiff', name: 'AIFF', label: 'AIFF (.aiff)', extension: 'aiff', isLossless: true, note: 'Uncompressed PCM, as Logic and GarageBand keep it.' },
  { id: 'flac', name: 'FLAC', label: 'FLAC (.flac)', extension: 'flac', isLossless: true, note: 'Lossless and about half the size of WAV.' },
  { id: 'mp3', name: 'MP3', label: 'MP3 (.mp3)', extension: 'mp3', isLossless: false, note: 'Compressed by LAME; plays everywhere.' },
  { id: 'ogg', name: 'Ogg Vorbis', label: 'Ogg Vorbis (.ogg)', extension: 'ogg', isLossless: false, note: 'Compressed by libvorbis; open and free.' },
];

export const SAMPLE_RATES: readonly SampleRate[] = [44100, 48000];
export const BIT_DEPTHS: readonly BitDepth[] = [16, 24];
export const MP3_BITRATES: readonly Mp3Bitrate[] = [128, 192, 256, 320, 0];
export const OGG_QUALITIES: readonly OggQuality[] = [4, 6, 8, 10];

/** Roughly what each Vorbis quality makes, in kbps (stereo at 44.1 kHz). */
const OGG_KBPS: Readonly<Record<OggQuality, number>> = { 4: 128, 6: 192, 8: 256, 10: 500 };

/** What the export panel sets. */
export interface AudioExportOptions {
  readonly formatId: AudioFormatId;
  readonly sampleRate: SampleRate;
  readonly bitDepth: BitDepth;
  readonly mp3Bitrate: Mp3Bitrate;
  readonly oggQuality: OggQuality;
  readonly range: AudioRange;
  /** One file per track ("stems"): each playing track alone. */
  readonly isPerTrack: boolean;
}

export const DEFAULT_AUDIO_EXPORT: AudioExportOptions = {
  formatId: 'wav',
  sampleRate: 44100,
  bitDepth: 16,
  mp3Bitrate: 192,
  oggQuality: 6,
  range: 'song',
  isPerTrack: false,
};

/** What GPAudioFileSettings reads. */
export interface AudioFileSettings {
  readonly format: AudioFormatId;
  readonly sampleRate: SampleRate;
  readonly bitDepth: BitDepth;
  readonly mp3Bitrate: Mp3Bitrate;
  readonly oggQuality: OggQuality;
}

export function audioFormat(id: AudioFormatId): AudioFormat {
  return AUDIO_FORMATS.find((format) => format.id === id) ?? AUDIO_FORMATS[0];
}

export function audioFileSettings(options: AudioExportOptions): AudioFileSettings {
  const { formatId, sampleRate, bitDepth, mp3Bitrate, oggQuality } = options;
  return { format: formatId, sampleRate, bitDepth, mp3Bitrate, oggQuality };
}

/** "44.1 kHz". */
export function sampleRateLabel(sampleRate: SampleRate): string {
  return `${sampleRate / 1000} kHz`;
}

/** "192 kbps", or "VBR" for the variable bit rate. */
export function mp3BitrateLabel(bitrate: Mp3Bitrate): string {
  return bitrate === 0 ? 'VBR' : `${bitrate} kbps`;
}

/** "Q6". */
export function oggQualityLabel(quality: OggQuality): string {
  return `Q${quality}`;
}

function qualityOf(options: AudioExportOptions): string {
  switch (options.formatId) {
    case 'mp3':
      return options.mp3Bitrate === 0 ? 'VBR (V2, about 190 kbps)' : mp3BitrateLabel(options.mp3Bitrate);
    case 'ogg':
      return `quality ${options.oggQuality} (about ${OGG_KBPS[options.oggQuality]} kbps)`;
    default:
      return `${options.bitDepth}-bit`;
  }
}

/** "WAV, 16-bit, 44.1 kHz", "MP3, 192 kbps, 48 kHz", "Ogg Vorbis, quality 6 (about 192 kbps), 44.1 kHz". */
export function audioQualityText(options: AudioExportOptions): string {
  return `${audioFormat(options.formatId).name}, ${qualityOf(options)}, ${sampleRateLabel(options.sampleRate)}`;
}
