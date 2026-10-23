// Port of TuxGuitar app.tuxguitar.io.gpx.v7.GPXFileSystem (LGPL-2.1).
import { unzipSync } from 'fflate';
import { GpFormatError } from '../../errors';
import { decodeUtf8Lenient } from '../../io/text';

/** Guitar Pro 7/8 container: a zip archive holding `Content/score.gpif` and a `VERSION` entry. */
export const GP7_SCORE_ENTRY = 'Content/score.gpif';
export const GP7_VERSION_ENTRY = 'VERSION';
/** The app's playback effects (effects/song-effects.ts), our own entry: Guitar Pro ignores it. */
export const GP7_EFFECTS_ENTRY = 'Content/GPEditor/effects.json';
/** Where Guitar Pro 8 keeps the audio track's file (`<Asset>`'s EmbeddedFilePath). */
export const GP7_ASSETS_FOLDER = 'Content/Assets/';

export interface Gp7Container {
  /** Bytes of the GPIF document. */
  readonly score: Uint8Array;
  /** Text of the VERSION entry (e.g. "7.0"), if present. */
  readonly version: string | undefined;
  /** Text of the app's effects entry, if present. */
  readonly effects?: string;
  /** Every entry's name (assets are only inflated when asked for). */
  readonly entryNames: ReadonlySet<string>;
  /** The entries under Content/Assets/, when asked for. */
  readonly assets?: Readonly<Record<string, Uint8Array>>;
}

export interface Gp7ContainerOptions {
  /** Inflate the audio files under Content/Assets/ too (they can be large). */
  readonly withAssets?: boolean;
}

export function readGp7Container(bytes: Uint8Array, options: Gp7ContainerOptions = {}): Gp7Container {
  const entryNames = new Set<string>();
  const entries = unzip(bytes, (name) => {
    entryNames.add(name);
    return name === GP7_SCORE_ENTRY || name === GP7_VERSION_ENTRY || name === GP7_EFFECTS_ENTRY || (options.withAssets === true && name.startsWith(GP7_ASSETS_FOLDER));
  });
  const score = entries[GP7_SCORE_ENTRY];
  if (score === undefined) {
    throw new GpFormatError(`Not a Guitar Pro 7/8 file: the archive has no ${GP7_SCORE_ENTRY}`);
  }
  const version = entries[GP7_VERSION_ENTRY];
  const effects = entries[GP7_EFFECTS_ENTRY];
  const assets = options.withAssets === true ? Object.fromEntries(Object.entries(entries).filter(([name]) => name.startsWith(GP7_ASSETS_FOLDER))) : undefined;
  return {
    score,
    version: version === undefined ? undefined : decodeUtf8Lenient(version).trim(),
    ...(effects === undefined ? {} : { effects: decodeUtf8Lenient(effects) }),
    entryNames,
    ...(assets === undefined ? {} : { assets }),
  };
}

function unzip(bytes: Uint8Array, isWanted: (name: string) => boolean): Readonly<Record<string, Uint8Array>> {
  try {
    return unzipSync(bytes, { filter: (file) => isWanted(file.name) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GpFormatError(`Corrupt Guitar Pro 7/8 file: invalid zip archive (${reason})`, { cause: error });
  }
}
