// Port of TuxGuitar app.tuxguitar.io.gpx.v7.GPXFileSystem (LGPL-2.1).
import { unzipSync } from 'fflate';
import { GpFormatError } from '../../errors';
import { decodeUtf8Lenient } from '../../io/text';

/** Guitar Pro 7/8 container: a zip archive holding `Content/score.gpif` and a `VERSION` entry. */
export const GP7_SCORE_ENTRY = 'Content/score.gpif';
export const GP7_VERSION_ENTRY = 'VERSION';
/** The app's playback effects (effects/song-effects.ts), our own entry: Guitar Pro ignores it. */
export const GP7_EFFECTS_ENTRY = 'Content/GPEditor/effects.json';

export interface Gp7Container {
  /** Bytes of the GPIF document. */
  readonly score: Uint8Array;
  /** Text of the VERSION entry (e.g. "7.0"), if present. */
  readonly version: string | undefined;
  /** Text of the app's effects entry, if present. */
  readonly effects?: string;
}

export function readGp7Container(bytes: Uint8Array): Gp7Container {
  const entries = unzip(bytes);
  const score = entries[GP7_SCORE_ENTRY];
  if (score === undefined) {
    throw new GpFormatError(`Not a Guitar Pro 7/8 file: the archive has no ${GP7_SCORE_ENTRY}`);
  }
  const version = entries[GP7_VERSION_ENTRY];
  const effects = entries[GP7_EFFECTS_ENTRY];
  return {
    score,
    version: version === undefined ? undefined : decodeUtf8Lenient(version).trim(),
    ...(effects === undefined ? {} : { effects: decodeUtf8Lenient(effects) }),
  };
}

function unzip(bytes: Uint8Array): Readonly<Record<string, Uint8Array>> {
  try {
    return unzipSync(bytes, {
      filter: (file) => file.name === GP7_SCORE_ENTRY || file.name === GP7_VERSION_ENTRY || file.name === GP7_EFFECTS_ENTRY,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GpFormatError(`Corrupt Guitar Pro 7/8 file: invalid zip archive (${reason})`, { cause: error });
  }
}
