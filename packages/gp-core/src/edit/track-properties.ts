// Track properties after TuxGuitar's TGTrackManager.changeInfo / changeOffset (LGPL-2.1).
import type { Song } from '../model/song';
import { updateTrack } from './song-paths';

/** Highest capo fret (TGTrack.MAX_OFFSET). */
export const MAX_CAPO = 24;

/** New song with the track renamed (trimmed). Same song for the same name, a blank one or a missing track. */
export function setTrackName(song: Song, trackIndex: number, name: string): Song {
  const next = typeof name === 'string' ? name.trim() : '';
  if (next === '') {
    return song;
  }
  return updateTrack(song, trackIndex, (track) => (track.name === next ? track : { ...track, name: next }));
}

/**
 * New song with a capo on fret `capo` of the track (0 = none; rounded, 0…MAX_CAPO). The frets stay as written, so
 * the track sounds `capo` semitones higher, as in Guitar Pro. Same song when nothing changes, the capo is not a number,
 * or the track is missing or a percussion track (drums have no capo).
 */
export function setTrackCapo(song: Song, trackIndex: number, capo: number): Song {
  if (!Number.isFinite(capo)) {
    return song;
  }
  const next = Math.min(MAX_CAPO, Math.max(0, Math.round(capo)));
  return updateTrack(song, trackIndex, (track) => (track.offset === next || track.isPercussion ? track : { ...track, offset: next }));
}
