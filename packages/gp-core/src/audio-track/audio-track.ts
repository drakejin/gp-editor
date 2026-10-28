// The song's audio track (Guitar Pro 7/8's backing track; not in TuxGuitar): its defaults and bounds, and the check every
// reader and edit applies, so an audio track from a file or an edit always lies within them.
import { clamp } from '../model/defaults';
import type { AudioSyncPoint, AudioTrack } from '../model/song';

/** The name Guitar Pro gives the audio track. */
export const AUDIO_TRACK_NAME = 'Audio Track';
/** Guitar Pro's default fader position (its channel strip's volume). */
export const DEFAULT_AUDIO_VOLUME = 0.8;
/** The pitch shift reaches two octaves either way (AVAudioUnitTimePitch's range). */
export const MAX_DETUNE_CENTS = 2400;
/** Most sync points kept from a file: one per bar of a very long song stays far below it. */
export const MAX_SYNC_POINTS = 10_000;
/** A file extension the model keeps: letters and digits, short. */
const EXTENSION = /^[a-z0-9]{1,8}$/;

/** What an audio track is built from: the id of its data, and any field to set (the others take their defaults). */
export type AudioTrackFields = Pick<AudioTrack, 'assetId'> & Partial<Omit<AudioTrack, 'assetId'>>;

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** "MP3" → "mp3"; anything that is not a short run of letters and digits → "". */
export function normalizeFileExtension(extension: string): string {
  const lower = extension.trim().replace(/^\./, '').toLowerCase();
  return EXTENSION.test(lower) ? lower : '';
}

/** The extension of a file name or path ("Song.MP3" → "mp3"); "" when it has none. */
export function fileExtensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : normalizeFileExtension(name.slice(dot + 1));
}

/** A whole bar index and occurrence, a place inside the bar, and a moment at or after the audio's start. */
export function isValidSyncPoint(point: AudioSyncPoint): boolean {
  return (
    Number.isInteger(point.measureIndex) &&
    point.measureIndex >= 0 &&
    Number.isInteger(point.occurrence) &&
    point.occurrence >= 0 &&
    point.position >= 0 &&
    point.position <= 1 &&
    Number.isFinite(point.seconds) &&
    point.seconds >= 0
  );
}

/** Whether two points mark the same place of the score (the same bar, occurrence and place in the bar). */
export function isSameSyncPlace(a: AudioSyncPoint, b: AudioSyncPoint): boolean {
  return a.measureIndex === b.measureIndex && a.occurrence === b.occurrence && a.position === b.position;
}

/**
 * The valid points in audio order (the order they play in, when they agree with the score), one per place of the score
 * (the first one kept), at most MAX_SYNC_POINTS.
 */
export function normalizeSyncPoints(points: readonly AudioSyncPoint[]): readonly AudioSyncPoint[] {
  const valid = points.filter(isValidSyncPoint).map(({ measureIndex, occurrence, position, seconds }) => ({ measureIndex, occurrence, position, seconds }));
  const sorted = [...valid].sort((a, b) => a.seconds - b.seconds);
  const places = new Set<string>();
  const unique = sorted.filter((point) => {
    const place = syncPlaceKey(point);
    const isNew = !places.has(place);
    places.add(place);
    return isNew;
  });
  return unique.slice(0, MAX_SYNC_POINTS);
}

function syncPlaceKey(point: AudioSyncPoint): string {
  return `${point.measureIndex}:${point.occurrence}:${point.position}`;
}

/**
 * An audio track with every field within its bounds: volume 0–1, a whole number of cents within ±MAX_DETUNE_CENTS, a
 * finite start, the sync points normalized; a blank name becomes AUDIO_TRACK_NAME.
 * @throws RangeError when the asset id is blank
 */
export function buildAudioTrack(fields: AudioTrackFields): AudioTrack {
  const assetId = fields.assetId.trim();
  if (assetId === '') {
    throw new RangeError('An audio track needs the id of its audio data');
  }
  const name = (fields.name ?? '').trim();
  return {
    assetId,
    fileExtension: normalizeFileExtension(fields.fileExtension ?? ''),
    originalFilePath: fields.originalFilePath ?? '',
    name: name === '' ? AUDIO_TRACK_NAME : name,
    volume: clamp(finiteOr(fields.volume, DEFAULT_AUDIO_VOLUME), 0, 1),
    mute: fields.mute ?? false,
    solo: fields.solo ?? false,
    detuneCents: Math.round(clamp(finiteOr(fields.detuneCents, 0), -MAX_DETUNE_CENTS, MAX_DETUNE_CENTS)),
    startSeconds: finiteOr(fields.startSeconds, 0),
    syncPoints: normalizeSyncPoints(fields.syncPoints ?? []),
  };
}
