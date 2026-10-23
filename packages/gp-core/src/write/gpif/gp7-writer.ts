// Guitar Pro 7/8 (.gp) output (no TuxGuitar counterpart: TuxGuitar reads .gp files, GPXInputStream v7, but cannot write them).
import { encodeUtf8 } from '../../io/text';
import type { Song } from '../../model/song';
import { assertWritable } from '../gtp-song';
import { zipGp7 } from './gp7-container';
import { buildGpifXml } from './gpif-writer';
import { isPercussionTrack } from './gpif-sounds';

/** Encode `song` as a Guitar Pro 7 file (a zip holding Content/score.gpif), which Guitar Pro 8 opens too. */
export function writeGp7(song: Song): Uint8Array {
  assertWritable(song);
  const score = encodeUtf8(buildGpifXml(song));
  return zipGp7(
    score,
    song.tracks.map((track) => isPercussionTrack(song, track)),
  );
}
