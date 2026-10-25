// Port of TuxGuitar app.tuxguitar.io.ptb.PTInputStream.read and PTFileFormatDetector (LGPL-2.1).
import { UnsupportedFormatError } from '../../errors';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { readPtSong } from './ptb-input-stream';
import { parsePtSong } from './ptb-song-parser';

/** PTFileFormatDetector.PTB_VERSION: Power Tab Editor 1.7 files ("ptab", version 4). */
const SUPPORTED_PTB_VERSION = '4';

/** Reads a Power Tab (.ptb) file: its guitar and bass scores, repeats and jumps played out. */
export function readPtb(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  if (detected.version !== SUPPORTED_PTB_VERSION) {
    throw new UnsupportedFormatError(`Power Tab file version ${detected.version} is not supported (only version 4, Power Tab Editor 1.7)`);
  }
  const song = readPtSong(bytes, options.charset);
  return parsePtSong(song, { format: 'ptb', version: detected.version });
}
