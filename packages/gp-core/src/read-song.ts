import { GpFormatError, UnsupportedFormatError } from './errors';
import { type DetectedFormat, detectFormat } from './formats/detect';
import { type SongFile, readGp7, readGp7File } from './formats/gpif/gp7';
import { readGpx } from './formats/gpif/gpx';
import { readGp1 } from './formats/gtp/gp1';
import { readGp2 } from './formats/gtp/gp2';
import { readGp3 } from './formats/gtp/gp3';
import { readGp4 } from './formats/gtp/gp4';
import { readGp5 } from './formats/gtp/gp5';
import { readMidi } from './formats/midi/midi-song-reader';
import { readMusicXml } from './formats/musicxml/musicxml-reader';
import { type ReadOptions, type ResolvedReadOptions, resolveReadOptions } from './formats/options';
import { readPtb } from './formats/ptb/ptb';
import { readTef } from './formats/tef/tef';
import type { FileFormat, Song } from './model/song';

type FormatReader = (bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions) => Song;

const READERS: Readonly<Record<FileFormat, FormatReader>> = {
  gp1: readGp1,
  gp2: readGp2,
  gp3: readGp3,
  gp4: readGp4,
  gp5: readGp5,
  gpx: readGpx,
  gp7: readGp7,
  ptb: readPtb,
  tef: readTef,
  midi: readMidi,
  musicxml: readMusicXml,
};

/**
 * Read any Guitar Pro file (GP1–GP5 binary, GP6 .gpx, GP7/8 .gp), Power Tab (.ptb), TablEdit (.tef), Standard MIDI
 * File (.mid) or MusicXML (.musicxml / .xml, compressed .mxl).
 * The format is detected from the content, not the file name.
 *
 * @throws UnsupportedFormatError when the bytes are not a known Guitar Pro format
 * @throws GpFormatError when the file is recognised but malformed
 */
export function readSong(input: Uint8Array | ArrayBuffer, options?: ReadOptions): Song {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const detected = detectFormat(bytes);
  if (detected === undefined) {
    throw new UnsupportedFormatError('Not a Guitar Pro file (unknown header)');
  }
  try {
    return READERS[detected.format](bytes, detected, resolveReadOptions(options));
  } catch (error) {
    if (error instanceof GpFormatError) {
      throw error;
    }
    throw new GpFormatError(`Failed to read ${detected.format} file: ${errorMessage(error)}`, { cause: error });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { SongFile } from './formats/gpif/gp7';

/**
 * Read a song file as readSong does, with the bytes of its audio track's file when it has one (Guitar Pro 7/8's audio
 * track; only .gp files hold one). The audio stays out of the Song: the model names it by `AudioTrack.assetId`.
 */
export function readSongFile(input: Uint8Array | ArrayBuffer, options?: ReadOptions): SongFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (detectFormat(bytes)?.format !== 'gp7') {
    return { song: readSong(bytes, options) };
  }
  try {
    return readGp7File(bytes);
  } catch (error) {
    if (error instanceof GpFormatError) {
      throw error;
    }
    throw new GpFormatError(`Failed to read gp7 file: ${errorMessage(error)}`, { cause: error });
  }
}
