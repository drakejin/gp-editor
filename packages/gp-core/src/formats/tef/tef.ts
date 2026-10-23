// Port of TuxGuitar app.tuxguitar.io.tef3.TESongReader (LGPL-2.1).
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { readTeSong } from './tef-input-stream';
import { parseTeSong } from './tef-song-parser';

/**
 * Reads a TablEdit (.tef) file of TablEdit 3 or later. TablEdit 2 files (TuxGuitar's tef2 reader) have no header to tell
 * them by and are not read.
 */
export function readTef(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  const song = readTeSong(bytes, options.charset);
  return parseTeSong(song, { format: 'tef', version: detected.version });
}
