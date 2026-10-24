// Guitar Pro 7/8 (.gp) output (no TuxGuitar counterpart: TuxGuitar reads .gp files, GPXInputStream v7, but cannot write them).
import { songEffectsToJson } from '../../effects/song-effects';
import { encodeUtf8 } from '../../io/text';
import type { Song } from '../../model/song';
import { assertWritable } from '../gtp-song';
import { zipGp7 } from './gp7-container';
import { audioAssetPath } from './gpif-audio-track';
import { buildGpifXml } from './gpif-writer';
import { isPercussionTrack } from './gpif-sounds';

/**
 * Encode `song` as a Guitar Pro 7 file (a zip holding Content/score.gpif), which Guitar Pro 8 opens too; its audio
 * track with `audioTrackData` as its file (Guitar Pro 8's Content/Assets/), left out without it.
 */
export function writeGp7(song: Song, audioTrackData?: Uint8Array): Uint8Array {
  assertWritable(song);
  const { audioTrack, ...withoutAudio } = song;
  const hasAudio = audioTrack !== undefined && audioTrackData !== undefined;
  const score = encodeUtf8(buildGpifXml(hasAudio ? song : withoutAudio));
  return zipGp7(
    score,
    song.tracks.map((track) => isPercussionTrack(song, track)),
    songEffectsToJson(song),
    song.tracks.map((track) => track.hasSlashNotation === true),
    hasAudio ? { path: audioAssetPath(audioTrack), data: audioTrackData } : undefined,
  );
}
