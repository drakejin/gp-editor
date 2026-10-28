// Edits of the song's audio track (Guitar Pro 7/8's backing track; not in TuxGuitar): the track itself, its mixer
// settings and its sync points. Each returns a new song, or the same song when nothing changes or the change cannot be
// made (a sync point against the order of the others, a bar that does not play that often).
import { buildAudioTrack, isSameSyncPlace, isValidSyncPoint } from '../audio-track/audio-track';
import { type SyncMap, buildSyncMap, syncPointTick } from '../audio-track/sync-map';
import type { AudioSyncPoint, AudioTrack, Song } from '../model/song';

/** What the audio track's strip sets. */
export type AudioTrackMix = Partial<Pick<AudioTrack, 'name' | 'volume' | 'mute' | 'solo' | 'detuneCents'>>;

/** Seconds of the audio a sync point may move between. */
export interface SecondsRange {
  readonly min: number;
  readonly max: number;
}

function isSameTrack(a: AudioTrack, b: AudioTrack): boolean {
  return (
    a.assetId === b.assetId &&
    a.fileExtension === b.fileExtension &&
    a.originalFilePath === b.originalFilePath &&
    a.name === b.name &&
    a.volume === b.volume &&
    a.mute === b.mute &&
    a.solo === b.solo &&
    a.detuneCents === b.detuneCents &&
    a.startSeconds === b.startSeconds &&
    a.syncPoints.length === b.syncPoints.length &&
    a.syncPoints.every((point, index) => {
      const other = b.syncPoints[index];
      return other !== undefined && isSameSyncPlace(point, other) && point.seconds === other.seconds;
    })
  );
}

/** The song with this audio track (its fields checked), or without one (`undefined`). */
export function setAudioTrack(song: Song, audioTrack: AudioTrack | undefined): Song {
  if (audioTrack === undefined) {
    if (song.audioTrack === undefined) {
      return song;
    }
    const { audioTrack: _removed, ...rest } = song;
    return rest;
  }
  const next = buildAudioTrack(audioTrack);
  return song.audioTrack !== undefined && isSameTrack(song.audioTrack, next) ? song : { ...song, audioTrack: next };
}

/** The audio track's name, volume, mute, solo or detune; the same song without an audio track. */
export function setAudioTrackMix(song: Song, mix: AudioTrackMix): Song {
  return song.audioTrack === undefined ? song : setAudioTrack(song, { ...song.audioTrack, ...mix });
}

/** The track's points but the one at `point`'s place of the score. */
function othersThan(track: AudioTrack, point: AudioSyncPoint): readonly AudioSyncPoint[] {
  return track.syncPoints.filter((other) => !isSameSyncPlace(other, point));
}

/** Whether `point` fits strictly between the anchors around its tick, in ticks and in seconds. */
function fitsBetweenAnchors(map: SyncMap, point: AudioSyncPoint): boolean {
  const tick = syncPointTick(map, point);
  if (tick === undefined) {
    return false;
  }
  const before = map.anchors.filter((anchor) => anchor.tick <= tick).pop();
  const after = map.anchors.find((anchor) => anchor.tick >= tick);
  return (before === undefined || (before.tick < tick && before.seconds < point.seconds)) && (after === undefined || (after.tick > tick && after.seconds > point.seconds));
}

/**
 * Whether `point` can be set: the song has an audio track, the point is valid, its bar plays that often, and it comes
 * after the points before it and before the points after it, in the score and in the audio (a point at the same place
 * of the score is replaced).
 */
export function canSetAudioSyncPoint(song: Song, point: AudioSyncPoint): boolean {
  const track = song.audioTrack;
  if (track === undefined || !isValidSyncPoint(point)) {
    return false;
  }
  const map = buildSyncMap({ ...song, audioTrack: { ...track, syncPoints: othersThan(track, point) } });
  return fitsBetweenAnchors(map, point);
}

/** The song with `point` added, or in place of the point at its place of the score; same song when it cannot be set. */
export function setAudioSyncPoint(song: Song, point: AudioSyncPoint): Song {
  const track = song.audioTrack;
  if (track === undefined || !canSetAudioSyncPoint(song, point)) {
    return song;
  }
  return setAudioTrack(song, { ...track, syncPoints: [...othersThan(track, point), point] });
}

/** The song without the sync point at `pointIndex`; same song when there is none. */
export function deleteAudioSyncPoint(song: Song, pointIndex: number): Song {
  const track = song.audioTrack;
  if (track?.syncPoints[pointIndex] === undefined) {
    return song;
  }
  return setAudioTrack(song, { ...track, syncPoints: track.syncPoints.filter((_, index) => index !== pointIndex) });
}

/**
 * Seconds the sync point at `pointIndex` may move between (exclusive): the points before and after it in the score, from
 * the audio's start; undefined when there is no such point or it does not take part in the map.
 */
export function syncPointSecondsRange(song: Song, pointIndex: number): SecondsRange | undefined {
  const map = buildSyncMap(song);
  const index = map.anchors.findIndex((anchor) => anchor.pointIndex === pointIndex);
  if (index < 0) {
    return undefined;
  }
  return { min: map.anchors[index - 1]?.seconds ?? 0, max: map.anchors[index + 1]?.seconds ?? Number.POSITIVE_INFINITY };
}

/** The song with the sync point at `pointIndex` at another moment of the audio; same song outside its range. */
export function moveAudioSyncPoint(song: Song, pointIndex: number, seconds: number): Song {
  const point = song.audioTrack?.syncPoints[pointIndex];
  return point === undefined ? song : setAudioSyncPoint(song, { ...point, seconds });
}

/** The audio track with its sync points moved along a bar inserted at `insertIndex` (they stay on their bars). */
export function withMeasureInserted(track: AudioTrack, insertIndex: number): AudioTrack {
  const syncPoints = track.syncPoints.map((point) => (point.measureIndex >= insertIndex ? { ...point, measureIndex: point.measureIndex + 1 } : point));
  return { ...track, syncPoints };
}

/** The audio track without the sync points of the deleted bar, those of later bars one bar back. */
export function withMeasureDeleted(track: AudioTrack, measureIndex: number): AudioTrack {
  const syncPoints = track.syncPoints
    .filter((point) => point.measureIndex !== measureIndex)
    .map((point) => (point.measureIndex > measureIndex ? { ...point, measureIndex: point.measureIndex - 1 } : point));
  return { ...track, syncPoints };
}
