import {
  type AudioRun,
  type AudioSyncPoint,
  type AudioTrack,
  MAX_DETUNE_CENTS,
  type Song,
  type SyncMap,
  audioSecondsAt,
} from '@gp-editor/core';
import { base64ToBytes } from './base64';

/** What the native player plays of the audio track under a render (GPAudioTrackPlayer.h). */
export interface AudioPlayback {
  readonly assetId: string;
  readonly runs: readonly AudioRun[];
  /** 0–1. */
  readonly gain: number;
  readonly detuneCents: number;
}

/** The audio track's waveform: min and max of every bucket (−127…127), `bucketsPerSecond` buckets per second of audio. */
export interface AudioPeaks {
  readonly bucketsPerSecond: number;
  readonly durationSeconds: number;
  /** min, max, min, max … */
  readonly values: Int8Array;
}

/** The mixer sliders' scale (MIXER.max); the audio track's volume is Guitar Pro's 0–1 fader. */
const SLIDER_MAX = 127;
/** Detune steps of the −/+ buttons: ten cents, and a semitone with the outer ones. */
export const DETUNE_STEP = 10;
export const SEMITONE_CENTS = 100;
const MAX_BUCKETS_PER_SECOND = 10_000;

/** The volume (0–1) on a mixer slider (0–127). */
export function volumeToSlider(volume: number): number {
  return Math.round(Math.min(1, Math.max(0, volume)) * SLIDER_MAX);
}

/** A mixer slider's value (0–127) as the audio track's volume (0–1). */
export function sliderToVolume(value: number): number {
  return Math.min(SLIDER_MAX, Math.max(0, value)) / SLIDER_MAX;
}

/** The fader as a gain: the curve of a MIDI channel's volume, so the same slider position sounds as loud. */
export function audioGain(volume: number): number {
  const clamped = Math.min(1, Math.max(0, volume));
  return clamped * clamped;
}

/** Whether the audio track plays: not muted, and solo when any track or the audio track is solo. */
export function isAudioTrackAudible(song: Song): boolean {
  const track = song.audioTrack;
  if (track === undefined || track.mute) {
    return false;
  }
  const hasSolo = track.solo || song.tracks.some((each) => each.solo);
  return !hasSolo || track.solo;
}

/** What to play of the audio track under a render; null when it is silent, has no runs, or there is none. */
export function audioPlaybackOf(song: Song, runs: readonly AudioRun[] | undefined): AudioPlayback | null {
  const track = song.audioTrack;
  if (track === undefined || runs === undefined || runs.length === 0 || !isAudioTrackAudible(song)) {
    return null;
  }
  return { assetId: track.assetId, runs, gain: audioGain(track.volume), detuneCents: track.detuneCents };
}

/** The moment of the audio heard at `seconds` of a render; undefined outside its runs. */
export function audioSecondsAtRender(runs: readonly AudioRun[] | undefined, seconds: number): number | undefined {
  const run = runs?.filter((candidate) => candidate.atSeconds <= seconds).at(-1);
  if (run === undefined) {
    return undefined;
  }
  const audio = run.fromSeconds + (seconds - run.atSeconds) * run.rate;
  return audio <= run.toSeconds ? audio : undefined;
}

/** "0 ¢", "+120 ¢", "−50 ¢". */
export function formatDetune(cents: number): string {
  if (cents === 0) {
    return '0 ¢';
  }
  return `${cents > 0 ? '+' : '−'}${Math.abs(cents)} ¢`;
}

/** The detune after a −/+ step, within ±MAX_DETUNE_CENTS. */
export function shiftDetune(cents: number, delta: number): number {
  return Math.min(MAX_DETUNE_CENTS, Math.max(-MAX_DETUNE_CENTS, cents + delta));
}

/** The occurrence of a bar heard nearest to a moment of the audio (its first when the moment is unknown). */
export function nearestOccurrence(map: SyncMap, measureIndex: number, audioSeconds: number | undefined): number {
  const bars = map.bars.filter((bar) => bar.measureIndex === measureIndex);
  if (audioSeconds === undefined || bars.length === 0) {
    return 0;
  }
  const distance = (tick: number): number => Math.abs(audioSecondsAt(map, tick) - audioSeconds);
  return bars.reduce((best, bar) => (distance(bar.tick) < distance(best.tick) ? bar : best)).occurrence;
}

/** "This bar starts now": the sync point putting the start of the bar's nearest occurrence at `audioSeconds`. */
export function syncPointAt(map: SyncMap, measureIndex: number, audioSeconds: number): AudioSyncPoint {
  return { measureIndex, occurrence: nearestOccurrence(map, measureIndex, audioSeconds), position: 0, seconds: audioSeconds };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The native waveform, checked (untrusted bridge data); undefined when it is not one. */
export function parseAudioPeaks(raw: unknown): AudioPeaks | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { bucketsPerSecond, durationSeconds, peaks } = raw as Record<string, unknown>;
  const isValid =
    isFiniteNumber(bucketsPerSecond) &&
    bucketsPerSecond > 0 &&
    bucketsPerSecond <= MAX_BUCKETS_PER_SECOND &&
    isFiniteNumber(durationSeconds) &&
    durationSeconds >= 0 &&
    typeof peaks === 'string';
  if (!isValid) {
    return undefined;
  }
  try {
    const bytes = base64ToBytes(peaks);
    return { bucketsPerSecond, durationSeconds, values: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2)) };
  } catch {
    // Not base64: no waveform to draw.
    return undefined;
  }
}

/** The audio track a picked file becomes: the file's name, the song's other settings start from Guitar Pro's defaults. */
export function newAudioTrackFields(file: { readonly assetId: string; readonly fileName: string; readonly extension: string }): Pick<AudioTrack, 'assetId' | 'fileExtension' | 'originalFilePath'> {
  return { assetId: file.assetId, fileExtension: file.extension, originalFilePath: file.fileName };
}

/** What a change of the audio track means for a playing song: nothing, new values heard live, or a restart. */
export type AudioTrackChange = 'none' | 'live' | 'restart';

/**
 * Another file, mute or solo restarts playback (what plays changes); volume and detune are heard live; sync points take
 * effect at the next start (a restart would jump back to the bar's start while the user taps along).
 */
export function audioTrackChange(previous: Song, next: Song): AudioTrackChange {
  const before = previous.audioTrack;
  const after = next.audioTrack;
  if (before === after) {
    return 'none';
  }
  if (before === undefined || after === undefined || before.assetId !== after.assetId || before.mute !== after.mute || before.solo !== after.solo) {
    return 'restart';
  }
  return before.volume !== after.volume || before.detuneCents !== after.detuneCents ? 'live' : 'none';
}
