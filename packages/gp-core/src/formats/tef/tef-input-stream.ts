// Port of TuxGuitar app.tuxguitar.io.tef3.TEInputStream.readSong (and the metadata, chord, measure, track, print and
// reading-list readers it calls) (LGPL-2.1).
import { GpFormatError, UnsupportedFormatError } from '../../errors';
import { ByteReader } from '../../io/byte-reader';
import { type Charset, decodeText } from '../../io/text';
import { isNoteValue } from '../../model/defaults';
import { TEF_HEADER_SIZE, type TeFileMetadata, readTefFileMetadata, readTefVersion } from './tef-header';
import { readComponents } from './tef-components';
import type { TeChordDefinition, TeLyrics, TeMeasure, TeSong, TeSongMetadata, TeTrack } from './tef-model';

/** A measure record is its size field (4 bytes, counted in it) and the 8 bytes read here. */
const MEASURE_SIZE_BIAS = 4;
const MEASURE_RECORD = 8;
/** A track record: the fields below, 12 tuning bytes, then the name. */
const TRACK_TUNING_OFFSET = 20;
const TRACK_NAME_OFFSET = 32;
const MAX_TEF_STRINGS = 12;
/** A chord record: 7 frets, 7 unused bytes, a 17-byte name, the anchor fret and 4 padding bytes. */
const CHORD_STRINGS = 7;
const CHORD_NAME_OFFSET = 14;
const CHORD_NAME_SIZE = 17;
const CHORD_RECORD = 36;
const CHORD_FRET_MASK = 0x1f;
const LYRICS_TRACK_SEPARATOR = '>';
const LINE_BREAK = /\r\n|\r|\n/;

/** TEInputStream.readSong. */
export function readTeSong(bytes: Uint8Array, charset: Charset): TeSong {
  if (readTefVersion(bytes) === undefined) {
    throw new UnsupportedFormatError('Not a TablEdit 3 file (unknown header)');
  }
  const fileMetadata = readTefFileMetadata(bytes);
  const reader = new ByteReader(bytes, charset);
  reader.skip(TEF_HEADER_SIZE);
  const songMetadata = readSongMetadata(reader, fileMetadata, charset);
  const chordDefinitions = fileMetadata.hasChords ? readChordDefinitions(reader, charset) : [];
  const measures = readMeasures(reader);
  const tracks = readTracks(reader, charset);
  reader.skip(reader.readShort() & 0xffff); // print metadata: page header and footer texts
  if (fileMetadata.hasReadingList) {
    skipReadingList(reader);
  }
  const components = readComponents(reader, measures, tracks);
  return { fileMetadata, songMetadata, chordDefinitions, measures, tracks, components };
}

/**
 * readShortString: a 16-bit length, then that many bytes ending in a NUL. TuxGuitar stops reading at the NUL; here the
 * whole length is read, so an early NUL cannot put the reader out of step.
 */
function readShortString(reader: ByteReader, charset: Charset): string {
  return untilNul(reader.readBytes(reader.readShort() & 0xffff), charset);
}

function untilNul(bytes: Uint8Array, charset: Charset): string {
  const end = bytes.indexOf(0);
  return decodeText(end < 0 ? bytes : bytes.subarray(0, end), charset);
}

function readSongMetadata(reader: ByteReader, file: TeFileMetadata, charset: Charset): TeSongMetadata {
  const read = (): string => readShortString(reader, charset);
  const title = read();
  const author = read();
  const comments = read();
  read(); // notes: TuxGuitar keeps them nowhere
  if (file.hasUrl) {
    read();
  }
  const copyright = file.hasCopyright ? read() : '';
  const lyrics = parseLyrics(read());
  const textEvents = file.hasTextEvents ? Array.from({ length: reader.readShort() & 0xffff }, read) : [];
  return { title, author, comments, copyright, lyrics, textEvents };
}

/**
 * parseLyricString: one block per track, each starting with ">" and a line such as "A f3 +0 c0 n0" whose first letter
 * names the track ("A" = the first). Only the letter and the lines below it are kept (the rest is layout).
 */
function parseLyrics(text: string): readonly TeLyrics[] {
  return text
    .split(LYRICS_TRACK_SEPARATOR)
    .map((block): TeLyrics => {
      const [first = '', ...lines] = block.split(LINE_BREAK);
      const letter = first.split(' ').find((part) => part !== '');
      return { trackIndex: letter === undefined ? 0 : letter.charCodeAt(0) - 'A'.charCodeAt(0), text: lines.join('\n') };
    })
    .filter((lyrics) => lyrics.text !== '');
}

/** Records of a fixed size the file states: each is read from its own slice, so its padding is skipped. */
function readRecords<T>(reader: ByteReader, size: number, count: number, read: (record: ByteReader, index: number) => T): readonly T[] {
  if (count * size > reader.remaining) {
    throw new GpFormatError(`${count} records of ${size} bytes do not fit in the rest of the file`);
  }
  return Array.from({ length: count }, (_, index) => read(new ByteReader(reader.readBytes(size)), index));
}

function readChordDefinitions(reader: ByteReader, charset: Charset): readonly TeChordDefinition[] {
  const size = reader.readShort() & 0xffff;
  const count = reader.readShort() & 0xffff;
  if (count > 0 && size < CHORD_RECORD) {
    throw new GpFormatError(`TablEdit chord records of ${size} bytes are too small`);
  }
  return readRecords(reader, size, count, (record) => {
    const frets = Array.from(record.readBytes(CHORD_STRINGS), (byte) => byte & CHORD_FRET_MASK);
    record.skip(CHORD_NAME_OFFSET - CHORD_STRINGS);
    return { frets, name: untilNul(record.readBytes(CHORD_NAME_SIZE), charset) };
  });
}

function readMeasures(reader: ByteReader): readonly TeMeasure[] {
  const size = (reader.readShort() & 0xffff) - MEASURE_SIZE_BIAS;
  const count = reader.readShort() & 0xffff;
  reader.skip(4);
  if (count > 0 && size < MEASURE_RECORD) {
    throw new GpFormatError(`TablEdit measure records of ${size} bytes are too small`);
  }
  return readRecords(reader, size, count, (record, index) => {
    record.skip(2); // flags (pickup measure, bar line style …), 0
    const keySignature = record.readByte();
    record.skip(1);
    const denominator = record.readUnsignedByte();
    const numerator = record.readUnsignedByte();
    if (numerator === 0 || !isNoteValue(denominator)) {
      throw new GpFormatError(`Invalid time signature ${numerator}/${denominator} in TablEdit measure ${index + 1}`);
    }
    return { keySignature, timeSignature: { numerator, denominator } };
  });
}

function readTracks(reader: ByteReader, charset: Charset): readonly TeTrack[] {
  const size = reader.readShort() & 0xffff;
  const count = reader.readShort() & 0xffff;
  if (count === 0 || size < TRACK_NAME_OFFSET) {
    throw new GpFormatError(`A TablEdit file needs at least one track (it has ${count} of ${size} bytes)`);
  }
  return readRecords(reader, size, count, (record) => readTrack(record, size, charset));
}

function readTrack(record: ByteReader, size: number, charset: Charset): TeTrack {
  const stringCount = record.readUnsignedByte();
  if (stringCount === 0 || stringCount > MAX_TEF_STRINGS) {
    throw new GpFormatError(`A TablEdit track has ${stringCount} strings`);
  }
  record.skip(7);
  const midiInstrument = record.readUnsignedByte();
  record.skip(3); // two unused bytes, transposition
  const capo = record.readUnsignedByte();
  record.skip(2); // unused, middle C offset
  const clef = record.readUnsignedByte() & 0x07;
  record.skip(1);
  const pan = record.readUnsignedByte();
  const volume = record.readUnsignedByte();
  record.skip(TRACK_TUNING_OFFSET - record.position);
  const tuning = Array.from({ length: stringCount }, () => record.readByte());
  record.skip(TRACK_NAME_OFFSET - record.position);
  const name = untilNul(record.readBytes(size - TRACK_NAME_OFFSET), charset);
  return { stringCount, midiInstrument, capo, clef, pan, volume, tuning, name };
}

/** The reading list (the order measures are played in) is not kept, as in TuxGuitar. */
function skipReadingList(reader: ByteReader): void {
  const size = reader.readShort() & 0xffff;
  const count = reader.readShort() & 0xffff;
  reader.skip(size * count);
}
