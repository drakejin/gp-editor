// Port of TuxGuitar app.tuxguitar.io.gtp.GP3OutputStream / GP4OutputStream (LGPL-2.1).
import type { MeasureHeader, Song, SongInfo, TimeSignature, Track } from '../model/song';
import { ByteWriter } from './byte-writer';
import { buildChannelTable, type ChannelTable, writeChannelTable } from './gp-channels';
import { type Gp34Dialect, placementsGp34, singleVoiceBeats, writeMeasureGp34 } from './gp34-beats';
import { GP3_DIALECT } from './gp3-dialect';
import { GP4_DIALECT } from './gp4-dialect';
import { writeColor, writeLyrics, writeTrackBlock } from './gtp-blocks';
import { assertWritable, resolveKeySignatures, tempoChangeAt, writableStrings } from './gtp-song';
import { resolveKeptTies } from './gtp-ties';

const VERSION_BLOCK = 30;
const MAX_SIGNED_BYTE = 127;

/** Encode `song` as a Guitar Pro 4.06 file. */
export function writeGp4(song: Song): Uint8Array {
  return writeGp34(song, GP4_DIALECT);
}

/** Encode `song` as a Guitar Pro 3.00 file. */
export function writeGp3(song: Song): Uint8Array {
  return writeGp34(song, GP3_DIALECT);
}

function writeGp34(song: Song, dialect: Gp34Dialect): Uint8Array {
  assertWritable(song);
  const writer = new ByteWriter();
  const channels = buildChannelTable(song.channels);
  const keys = resolveKeySignatures(song);
  writer.writeStringByte(dialect.version, VERSION_BLOCK);
  writeInfo(writer, song.info);
  writer.writeBoolean(song.measureHeaders[0]?.tripletFeel === 'eighth');
  if (dialect.hasLyrics) {
    writeLyrics(writer, song.tracks);
  }
  writer.writeInt(song.measureHeaders[0]?.tempo ?? 0).writeInt(keys[0] ?? 0); // tempo, key signature
  if (dialect.hasLyrics) {
    writer.writeByte(0); // GP4: octave
  }
  writeChannelTable(writer, channels);
  writer.writeInt(song.measureHeaders.length).writeInt(song.tracks.length);
  const context = { song, keys, isSongKeyInFirstHeader: dialect.hasLyrics };
  song.measureHeaders.forEach((header, index) => writeMeasureHeader(writer, header, index, context));
  song.tracks.forEach((track) => writeTrack(writer, track, channels));
  writeMeasures(writer, song, dialect);
  return writer.skipBytes(dialect.trailingZeros).toBytes();
}

/** GP3/GP4 have one author string: the lyricist, else the composer. */
function writeInfo(writer: ByteWriter, info: SongInfo): void {
  const author = info.words !== '' ? info.words : info.music;
  const fields = [info.title, info.subtitle, info.artist, info.album, author, info.copyright, info.transcriber, info.instructions];
  fields.forEach((text) => writer.writeStringByteSizeOfInteger(text));
  writer.writeInt(info.notice.length);
  info.notice.forEach((line) => writer.writeStringByteSizeOfInteger(line));
}

interface HeaderContext {
  readonly song: Song;
  readonly keys: readonly number[];
  /**
   * GP4 repeats the song key in the first header (as TuxGuitar does); GP3 only when it is not C major (Guitar Pro 3's
   * C-major files have no key there; readers such as alphaTab take a measure's key only from the headers).
   */
  readonly isSongKeyInFirstHeader: boolean;
}

/**
 * GP3/GP4 alternate ending: the number of the (last) ending; the reader gives the measure the endings up
 * to it not used since the repeat opened.
 */
function alternateEndingNumber(mask: number): number {
  return mask === 0 ? 0 : 32 - Math.clz32(mask & 0xff);
}

function headerFlags(header: MeasureHeader, previous: TimeSignature | undefined, keyChanges: boolean): number {
  return (
    (previous === undefined || previous.numerator !== header.timeSignature.numerator ? 0x01 : 0) |
    (previous === undefined || previous.denominator !== header.timeSignature.denominator ? 0x02 : 0) |
    (header.repeatOpen ? 0x04 : 0) |
    (header.repeatClose !== 0 ? 0x08 : 0) |
    (alternateEndingNumber(header.repeatAlternative) !== 0 ? 0x10 : 0) |
    (header.marker !== undefined ? 0x20 : 0) |
    (keyChanges ? 0x40 : 0)
  );
}

/** GP3/GP4 measure header: the order the readers use (TuxGuitar's GP4 writer puts the marker first). */
function writeMeasureHeader(writer: ByteWriter, header: MeasureHeader, index: number, context: HeaderContext): void {
  const key = context.keys[index] ?? 0;
  const keyChanges = index === 0 ? context.isSongKeyInFirstHeader || key !== 0 : key !== context.keys[index - 1];
  const flags = headerFlags(header, context.song.measureHeaders[index - 1]?.timeSignature, keyChanges);
  writer.writeUnsignedByte(flags);
  if ((flags & 0x01) !== 0) {
    writer.writeByte(header.timeSignature.numerator);
  }
  if ((flags & 0x02) !== 0) {
    writer.writeByte(header.timeSignature.denominator);
  }
  if ((flags & 0x08) !== 0) {
    writer.writeByte(Math.max(-MAX_SIGNED_BYTE - 1, Math.min(MAX_SIGNED_BYTE, header.repeatClose)));
  }
  if ((flags & 0x10) !== 0) {
    writer.writeUnsignedByte(alternateEndingNumber(header.repeatAlternative));
  }
  if (header.marker !== undefined) {
    writer.writeStringByteSizeOfInteger(header.marker.title);
    writeColor(writer, header.marker.color);
  }
  if (keyChanges) {
    writer.writeByte(key).writeByte(0); // key, major
  }
}

function writeTrack(writer: ByteWriter, track: Track, table: ChannelTable): void {
  writeTrackBlock(writer, track, track.isPercussion ? 0x01 : 0, table);
}

/** Measure 1 of every track, then measure 2 …; a tempo change goes on the first track with a beat. */
function writeMeasures(writer: ByteWriter, song: Song, dialect: Gp34Dialect): void {
  const written = song.tracks.map((track) =>
    track.measures.map((measure, index) => {
      const header = song.measureHeaders[index];
      return header === undefined ? [] : singleVoiceBeats(measure, header);
    }),
  );
  const contexts = song.tracks.map((track, trackIndex) => ({
    dialect,
    stringCount: writableStrings(track).length,
    keptTies: resolveKeptTies(song, track, (_, index) => placementsGp34(written[trackIndex]?.[index] ?? [])),
  }));
  song.measureHeaders.forEach((_, index) => {
    const tempoChange = tempoChangeAt(song, index);
    const carrier = written.findIndex((measures) => (measures[index]?.length ?? 0) > 0);
    contexts.forEach((context, trackIndex) => {
      const beats = written[trackIndex]?.[index] ?? [];
      writeMeasureGp34(writer, beats, trackIndex === carrier && tempoChange !== undefined ? { ...context, tempoChange } : context);
    });
  });
}
