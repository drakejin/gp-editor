// Port of TuxGuitar app.tuxguitar.io.gpx.v6.GPXInputStream (LGPL-2.1).
import { GpFormatError } from '../../errors';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { GPX_SCORE_FILE, readGpxContainer } from './bcfs';
import { readGpifDocument } from './gpif-reader';
import { gpifToSong } from './gpif-to-song';
import { gpifVersionString } from './gpif-version';
import { GPX_PART_CONFIGURATION_FILE, readPartConfiguration } from './part-configuration';

/** Read a Guitar Pro 6 `.gpx` file (BCFZ/BCFS container holding score.gpif). */
export function readGpx(bytes: Uint8Array, detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  const files = readGpxContainer(bytes);
  const score = files.get(GPX_SCORE_FILE);
  if (score === undefined) {
    throw new GpFormatError(`Corrupt gpx file: the container has no ${GPX_SCORE_FILE}`);
  }
  const doc = readGpifDocument(score, 6);
  const version = gpifVersionString(doc, undefined) || detected.version;
  return gpifToSong(doc, { format: 'gpx', version }, readPartConfiguration(files.get(GPX_PART_CONFIGURATION_FILE)));
}
