// Port of TuxGuitar app.tuxguitar.io.gtp.GP1InputStream (LGPL-2.1).
import { UnsupportedFormatError } from '../../errors';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { type LegacyDialect, readLegacySong } from './legacy-shared';
import { DEFAULT_VELOCITY } from './shared';

/** SUPPORTED_VERSIONS: header string → version code. */
const VERSION_CODES: ReadonlyMap<string, number> = new Map([
  ['FICHIER GUITARE PRO v1', 0],
  ['FICHIER GUITARE PRO v1.01', 1],
  ['FICHIER GUITARE PRO v1.02', 2],
  ['FICHIER GUITARE PRO v1.03', 3],
  ['FICHIER GUITARE PRO v1.04', 4],
]);

/** Reads a Guitar Pro 1 file (v1 … v1.04). */
export function readGp1(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  const code = VERSION_CODES.get(detected.version);
  if (code === undefined) {
    throw new UnsupportedFormatError(`Unsupported Guitar Pro 1 version "${detected.version}"`);
  }
  return readLegacySong(bytes, detected, options, gp1Dialect(code));
}

/**
 * v1.01 and earlier: one track with six strings. v1.02: a string count per track.
 * v1.03: eight tracks with names, mixer values and a key signature. v1.04: chord diagrams.
 */
function gp1Dialect(code: number): LegacyDialect {
  return {
    format: 'gp1',
    trackCount: code > 2 ? 8 : 1,
    hasStringCount: code > 1,
    hasTrackDetails: code > 2,
    hasFullChords: code > 3,
    hasGraceFlags: false,
    readBeatPrefix: () => undefined,
    readVelocity: () => DEFAULT_VELOCITY,
  };
}
