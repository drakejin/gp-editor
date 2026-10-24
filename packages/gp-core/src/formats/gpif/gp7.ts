// Port of TuxGuitar app.tuxguitar.io.gpx.v7.GPXInputStream (LGPL-2.1).
import { readSongEffects } from '../../effects/song-effects';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { type Gp7Container, readGp7Container } from './container-gp7';
import { readGpifDocument } from './gpif-reader';
import { gpifToSong } from './gpif-to-song';
import { gpifVersionString } from './gpif-version';
import { readPartConfiguration } from './part-configuration';

/** A song read with the audio track's file (`readSongFile`). */
export interface SongFile {
  readonly song: Song;
  /** The bytes of the audio track's file, when the song has an audio track. */
  readonly audioTrackData?: Uint8Array;
}

/** The song of a container; an audio track whose file the archive does not hold is left out. */
function songOf(container: Gp7Container): { readonly song: Song; readonly assetPath?: string } {
  const doc = readGpifDocument(container.score, 7);
  const views = readPartConfiguration(container.partConfiguration);
  const read = gpifToSong(doc, { format: 'gp7', version: gpifVersionString(doc, container.version) }, views);
  const withEffects = container.effects === undefined ? read : readSongEffects(read, container.effects);
  const assetPath = doc.audioTrack?.asset?.embeddedFilePath;
  if (withEffects.audioTrack === undefined || (assetPath !== undefined && container.entryNames.has(assetPath))) {
    return { song: withEffects, ...(assetPath === undefined ? {} : { assetPath }) };
  }
  const { audioTrack: _missing, ...song } = withEffects;
  return { song };
}

/** Read a Guitar Pro 7 or 8 `.gp` file (zip archive holding Content/score.gpif). */
export function readGp7(bytes: Uint8Array, _detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  return songOf(readGp7Container(bytes)).song;
}

/** Read a `.gp` file and the bytes of its audio track's file (Content/Assets/…). */
export function readGp7File(bytes: Uint8Array): SongFile {
  const container = readGp7Container(bytes, { withAssets: true });
  const { song, assetPath } = songOf(container);
  const audioTrackData = song.audioTrack === undefined || assetPath === undefined ? undefined : container.assets?.[assetPath];
  return audioTrackData === undefined ? { song } : { song, audioTrackData };
}
