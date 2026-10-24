// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): reading context, song information and the measures into a song.
import { GpFormatError, errorMessage } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';
import { measureTicks } from '../../model/defaults';
import { QUARTER_TIME } from '../../model/song';
import type { Beat, Lyrics, Marker, Measure, MeasureHeader, Rgb, Song, SongInfo, SourceInfo } from '../../model/song';
import { GTP_VERSION_BLOCK } from '../detect';
import type { ChannelRegistry } from './gtp-channels';
import type { HeaderDraft, TrackRead } from './gtp-tracks';
import { normalizeSong } from './normalize';

/** Wraps any failure of `read` in a GpFormatError that says where it happened. */
export function withContext<T>(context: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw new GpFormatError(`${context}: ${errorMessage(error)}`, { cause: error });
  }
}

export function skipVersion(reader: ByteReader): void {
  reader.readStringByte(GTP_VERSION_BLOCK);
}

export function readInts(reader: ByteReader, count: number): readonly number[] {
  return Array.from({ length: count }, () => reader.readInt());
}

// ---------------------------------------------------------------- song info

/** GP3/GP4 have one "author" string, used for both words and music; GP5 has both. */
export function readSongInfo(reader: ByteReader, hasMusicField: boolean): SongInfo {
  const read = (): string => reader.readStringByteSizeOfInteger();
  const title = read();
  const subtitle = read();
  const artist = read();
  const album = read();
  const words = read();
  const music = hasMusicField ? read() : words;
  const copyright = read();
  const transcriber = read();
  const instructions = read();
  const noticeCount = reader.readInt();
  const notice = Array.from({ length: Math.max(0, noticeCount) }, read);
  return { title, subtitle, artist, album, words, music, copyright, transcriber, instructions, notice };
}

/** GP4/GP5 lyrics: the first of the five lines is kept, as in TuxGuitar. */
export function readLyrics(reader: ByteReader): Lyrics {
  const from = reader.readInt();
  const text = reader.readStringInteger();
  for (let i = 0; i < 4; i++) {
    reader.readInt();
    reader.readStringInteger();
  }
  return { from, text };
}

export function readKeySignature(reader: ByteReader): number {
  // TuxGuitar re-encodes flats as 8…14; the model keeps the signed count (-7…7).
  return reader.readByte();
}

export function readColor(reader: ByteReader): Rgb {
  const r = reader.readUnsignedByte();
  const g = reader.readUnsignedByte();
  const b = reader.readUnsignedByte();
  reader.skip(1);
  return { r, g, b };
}

export function readMarker(reader: ByteReader): Marker {
  const title = reader.readStringByteSizeOfInteger();
  return { title, color: readColor(reader) };
}

/** What a format reader needs to read one track's measure. */
export interface MeasureJob {
  /** Start of the measure in ticks. */
  readonly start: number;
  /** Tempo in effect when the measure starts (mix-table changes update it). */
  readonly tempo: number;
  readonly track: TrackRead;
  /** Measures of this track read so far, beats in reading order (for tied notes). */
  readonly previous: readonly Measure[];
}

export interface MeasureBeats {
  readonly beats: readonly Beat[];
  /** Tempo in effect after the measure. */
  readonly tempo: number;
}

/** Everything read before the measures. */
export interface SongParts {
  readonly source: SourceInfo;
  readonly info: SongInfo;
  readonly registry: ChannelRegistry;
  readonly headers: readonly HeaderDraft[];
  /** Key signature per measure (carried over from the previous measure). */
  readonly keySignatures: readonly number[];
  readonly tracks: readonly TrackRead[];
  /** Song tempo from the file header. */
  readonly tempo: number;
}

/**
 * Reads the measures (all tracks of measure 1, then of measure 2 …) the way TuxGuitar's readMeasures
 * does: measure 1 starts at QUARTER_TIME, each header takes the tempo in effect after its measure.
 */
export function readSongMeasures(parts: SongParts, readBeats: (job: MeasureJob) => MeasureBeats): Song {
  const measures: Measure[][] = parts.tracks.map(() => []);
  const headers: MeasureHeader[] = [];
  let start = QUARTER_TIME;
  let tempo = parts.tempo;
  parts.headers.forEach((header, index) => {
    parts.tracks.forEach((track, trackIndex) => {
      const previous = measures[trackIndex] ?? [];
      const context = `measure ${index + 1}, track ${trackIndex + 1}`;
      const result = withContext(context, () => readBeats({ start, tempo, track, previous }));
      tempo = result.tempo;
      const keySignature = parts.keySignatures[index] ?? 0;
      previous.push({ headerIndex: index, clef: track.clef, keySignature, beats: result.beats });
    });
    headers.push({ ...header, start, tempo });
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  });
  return assembleSong(parts, headers, measures);
}

function assembleSong(parts: SongParts, headers: readonly MeasureHeader[], measures: readonly Measure[][]): Song {
  const tracks = parts.tracks.map((track, index) => ({
    ...track.draft,
    measures: (measures[index] ?? []).map(sortBeats),
  }));
  const song: Song = {
    source: parts.source,
    info: parts.info,
    channels: parts.registry.channels,
    measureHeaders: headers,
    tracks,
  };
  return normalizeSong(song, parts.registry.gmChannels);
}

/** GP5 voices can add beats out of order; TuxGuitar sorts them by start (stable) before use. */
function sortBeats(measure: Measure): Measure {
  return { ...measure, beats: [...measure.beats].sort((a, b) => a.start - b.start) };
}
