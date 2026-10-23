// MusicXML import (TuxGuitar has a MusicXML writer but no reader): score-partwise / score-timewise text or compressed .mxl → Song.
import { GpFormatError } from '../../errors';
import type { Channel, Song, Track } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { isMusicXmlArchive, readMusicXmlArchive } from './musicxml-container';
import { decodeMusicXml, parseMusicXml, scoreParts, toPartwise } from './musicxml-document';
import { buildMeasureHeaders } from './musicxml-headers';
import { readPartMeasures } from './musicxml-measures';
import { readPartInfo, readSongInfo } from './musicxml-part-list';
import { type PartSource, buildPartTrack } from './musicxml-track';
import { MAX_PARTS } from './musicxml-values';

/**
 * Read a MusicXML file: each part becomes a track (strings and frets from a tab staff when there is one, else written
 * pitches placed on a guitar's or bass's strings), measures become measure headers (time signature, tempo, repeats,
 * endings, rehearsal marks) and voices become the model's voices. score-timewise documents are converted.
 *
 * @throws GpFormatError when the document is malformed, not a MusicXML score, or larger than the reader's limits
 */
export function readMusicXml(bytes: Uint8Array, _detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  const scoreBytes = isMusicXmlArchive(bytes) ? readMusicXmlArchive(bytes) : bytes;
  const score = toPartwise(parseMusicXml(decodeMusicXml(scoreBytes)));
  if (score.parts.length > MAX_PARTS) {
    throw new GpFormatError(`MusicXML score has ${score.parts.length} parts; at most ${MAX_PARTS} are read`);
  }
  const scorePartsById = scoreParts(score.root);
  const sources: readonly PartSource[] = score.parts.map((part) => ({ info: readPartInfo(scorePartsById.get(part.id)), measures: readPartMeasures(part) }));
  const measureHeaders = buildMeasureHeaders(sources.map((source) => source.measures));
  const channels: Channel[] = [];
  const tracks: Track[] = [];
  sources.forEach((source, index) => {
    const built = buildPartTrack(source, measureHeaders, index + 1, channels);
    channels.push(built.channel);
    tracks.push(built.track);
  });
  return { source: { format: 'musicxml', version: score.version }, info: readSongInfo(score.root), channels, measureHeaders, tracks };
}
