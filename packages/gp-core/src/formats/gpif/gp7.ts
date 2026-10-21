// Port of TuxGuitar app.tuxguitar.io.gpx.v7.GPXInputStream (LGPL-2.1).
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { readGp7Container } from './container-gp7';
import { readGpifDocument } from './gpif-reader';
import { gpifToSong } from './gpif-to-song';
import { gpifVersionString } from './gpif-version';

/** Read a Guitar Pro 7 or 8 `.gp` file (zip archive holding Content/score.gpif). */
export function readGp7(bytes: Uint8Array, _detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  const container = readGp7Container(bytes);
  const doc = readGpifDocument(container.score, 7);
  return gpifToSong(doc, { format: 'gp7', version: gpifVersionString(doc, container.version) });
}
