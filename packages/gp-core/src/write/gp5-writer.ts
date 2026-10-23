// Port of TuxGuitar app.tuxguitar.io.gtp.GP5OutputStream (LGPL-2.1), writing "v5.10" files.
import { DEFAULT_PERCUSSION_BANK } from '../model/defaults';
import type { Channel, MeasureHeader, Song, SongInfo, TimeSignature, Track, TripletFeel } from '../model/song';
import { ByteWriter } from './byte-writer';
import { buildChannelTable, type ChannelTable, writeChannelTable } from './gp-channels';
import { writeMeasureGp5 } from './gp5-beats';
import { writeDirectionsGp5 } from './gp5-directions';
import { readOrderGp5 } from './gp5-voices';
import { writeColor, writeLyrics, writeTrackBlock } from './gtp-blocks';
import { assertWritable, resolveKeySignatures, tempoChangeAt, writableStrings, writtenTempo } from './gtp-song';
import { resolveKeptTies } from './gtp-ties';

/** Version string of the files this writer produces (and of a new song, which is saved as one). */
export const GP5_VERSION = 'FICHIER GUITAR PRO v5.10';
const VERSION_BLOCK = 30;
/** Track clef value GP5 uses for bass-clef tunings (the reader's GP5_BASS_CLEF). */
const GP5_BASS_CLEF = 12;
/** Score size, page and margins in millimetres (A4), as Guitar Pro 5 and TuxGuitar write them. */
const PAGE_SETUP = [210, 297, 10, 10, 15, 10, 100] as const;
/** Header/footer flags: every element shown. */
const PAGE_FLAGS = 0x01ff;
const PAGE_LINES = [
  '%TITLE%',
  '%SUBTITLE%',
  '%ARTIST%',
  '%ALBUM%',
  'Words by %WORDS%',
  'Music by %MUSIC%',
  'Words & Music by %WORDSMUSIC%',
  'Copyright %COPYRIGHT%',
  'All Rights Reserved - International Copyright Secured',
  'Page %N%/%P%',
] as const;
const TEMPO_NAME = 'Moderate';
const MASTER_VOLUME = 100;
const EQUALIZER_BANDS = 11;
/** Staff and playback flags of a new Guitar Pro 5 track (tablature, notation, diagram list …). */
const TRACK_STAFF_FLAGS = 0x0143;
/** RSE settings of a track without RSE: the bytes Guitar Pro 5 and TuxGuitar write. */
const TRACK_RSE_BYTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -1, 3] as const;
const RSE_INSTRUMENT_SIZE = 16;
const TRACK_EQUALIZER_SIZE = 4;

const TRIPLET_FEEL_BYTES: Readonly<Record<TripletFeel, number>> = { none: 0, eighth: 1, sixteenth: 2 };

/** Encode `song` as a Guitar Pro 5.10 file. */
export function writeGp5(song: Song): Uint8Array {
  assertWritable(song);
  const writer = new ByteWriter();
  const channels = buildChannelTable(song.channels);
  const keys = resolveKeySignatures(song);
  writer.writeStringByte(GP5_VERSION, VERSION_BLOCK);
  writeInfo(writer, song.info);
  writeLyrics(writer, song.tracks);
  writeRseMasterEffect(writer);
  writePageSetup(writer);
  writer.writeInt(writtenTempo(song, 0) ?? 0).writeByte(0); // tempo, "hide tempo"
  writer.writeByte(keys[0] ?? 0).writeInt(0); // key signature, octave
  writeChannelTable(writer, channels);
  writeDirectionsGp5(writer, song.measureHeaders);
  writer.writeInt(0); // master reverb
  writer.writeInt(song.measureHeaders.length).writeInt(song.tracks.length);
  song.measureHeaders.forEach((header, index) => writeMeasureHeader(writer, header, index, { song, keys }));
  song.tracks.forEach((track) => writeTrack(writer, track, song.channels, channels));
  writeMeasures(writer, song);
  return writer.toBytes();
}

function writeInfo(writer: ByteWriter, info: SongInfo): void {
  const fields = [info.title, info.subtitle, info.artist, info.album, info.words, info.music];
  [...fields, info.copyright, info.transcriber, info.instructions].forEach((text) => writer.writeStringByteSizeOfInteger(text));
  writer.writeInt(info.notice.length);
  info.notice.forEach((line) => writer.writeStringByteSizeOfInteger(line));
}

/** v5.10 RSE master effect: volume, an unknown int, a flat 10-band equalizer and gain. */
function writeRseMasterEffect(writer: ByteWriter): void {
  writer.writeInt(MASTER_VOLUME).writeInt(0).skipBytes(EQUALIZER_BANDS);
}

/** Page setup, the header/footer templates, and the tempo name (GP5OutputStream#writePageSetup). */
function writePageSetup(writer: ByteWriter): void {
  PAGE_SETUP.forEach((value) => writer.writeInt(value));
  writer.writeShort(PAGE_FLAGS);
  PAGE_LINES.forEach((line) => writer.writeStringByteSizeOfInteger(line));
  writer.writeStringByteSizeOfInteger(TEMPO_NAME);
}

interface HeaderContext {
  readonly song: Song;
  readonly keys: readonly number[];
}

function headerFlags(header: MeasureHeader, previous: TimeSignature | undefined, keyChanges: boolean): number {
  return (
    (previous === undefined || previous.numerator !== header.timeSignature.numerator ? 0x01 : 0) |
    (previous === undefined || previous.denominator !== header.timeSignature.denominator ? 0x02 : 0) |
    (header.repeatOpen ? 0x04 : 0) |
    (header.repeatClose !== 0 ? 0x08 : 0) |
    ((header.repeatAlternative & 0xff) !== 0 ? 0x10 : 0) |
    (header.marker !== undefined ? 0x20 : 0) |
    (keyChanges ? 0x40 : 0)
  );
}

/** Bytes of the default beam grouping (eighth notes per group, four groups) Guitar Pro writes with a time signature. */
function beamGroupBytes(timeSignature: TimeSignature): readonly number[] {
  const { numerator, denominator } = timeSignature;
  const isCompound = denominator === 8 && numerator % 3 === 0;
  const groups = isCompound ? numerator / 3 : numerator;
  const groupSize = isCompound ? 3 : 8 / denominator;
  if (denominator <= 8 && groups <= 4 && Number.isInteger(groupSize) && (isCompound || denominator <= 4)) {
    return Array.from({ length: 4 }, (_, i) => (i < groups ? groupSize : 0));
  }
  return tuxGuitarBeamBytes(timeSignature);
}

/** GP5OutputStream#makeBeamEighthNoteBytes. */
function tuxGuitarBeamBytes({ numerator, denominator }: TimeSignature): readonly number[] {
  if (denominator > 8) {
    return [0, 0, 0, 0];
  }
  const total = (8 / denominator) * numerator;
  const value = Math.floor(total / 4);
  const missing = total - 4 * value;
  return [value + missing, value, value, value];
}

function writeMeasureHeader(writer: ByteWriter, header: MeasureHeader, index: number, context: HeaderContext): void {
  const key = context.keys[index] ?? 0;
  const keyChanges = index === 0 || key !== context.keys[index - 1];
  const flags = headerFlags(header, context.song.measureHeaders[index - 1]?.timeSignature, keyChanges);
  writer.writeUnsignedByte(flags);
  if ((flags & 0x01) !== 0) {
    writer.writeByte(header.timeSignature.numerator);
  }
  if ((flags & 0x02) !== 0) {
    writer.writeByte(header.timeSignature.denominator);
  }
  if ((flags & 0x08) !== 0) {
    writer.writeUnsignedByte(Math.max(0, Math.min(header.repeatClose + 1, 0xff))); // the reader subtracts 1
  }
  if (header.marker !== undefined) {
    writer.writeStringByteSizeOfInteger(header.marker.title);
    writeColor(writer, header.marker.color);
  }
  if (keyChanges) {
    writer.writeByte(key).writeByte(0); // key, major
  }
  if ((flags & 0x03) !== 0) {
    writer.writeBytes(beamGroupBytes(header.timeSignature));
  }
  writer.writeUnsignedByte(header.repeatAlternative & 0xff);
  writer.writeByte(TRIPLET_FEEL_BYTES[header.tripletFeel]);
  writer.skipBytes(1); // before the next header (after the last one: before the first track)
}

function trackFlags(track: Track): number {
  return 0x08 | (track.isPercussion ? 0x01 : 0) | (track.solo ? 0x10 : 0) | (track.mute ? 0x20 : 0);
}

/** GP5 MIDI bank byte of the track (the readers take the bank from the channel slot instead). */
function trackBank(channel: Channel | undefined): number {
  const bank = channel?.bank ?? 0;
  return bank === DEFAULT_PERCUSSION_BANK || bank < 0 || bank > 0xff ? 0 : bank;
}

function writeTrack(writer: ByteWriter, track: Track, songChannels: readonly Channel[], table: ChannelTable): void {
  const isBass = track.measures[0]?.clef === 'bass';
  writeTrackBlock(writer, track, trackFlags(track), table);
  writer.writeShort(TRACK_STAFF_FLAGS).writeByte(0); // auto accentuation
  writer.writeUnsignedByte(trackBank(songChannels.find((channel) => channel.id === track.channelId)));
  writer.writeByte(0); // RSE humanize
  const clef = isBass ? GP5_BASS_CLEF : 0;
  writer.writeInt(clef).writeInt(clef).writeInt(100).writeBytes(TRACK_RSE_BYTES);
  writer.writeBytes(new Array<number>(RSE_INSTRUMENT_SIZE).fill(0xff)).skipBytes(TRACK_EQUALIZER_SIZE);
  writer.writeStringByteSizeOfInteger('').writeStringByteSizeOfInteger(''); // RSE effect name, category
}

/**
 * Measure 1 of every track, then measure 2 …, each after a byte (TuxGuitar writes it after the tracks and
 * after every measure; Guitar Pro 5 files have none after the last measure).
 */
function writeMeasures(writer: ByteWriter, song: Song): void {
  const contexts = song.tracks.map((track) => ({
    stringCount: writableStrings(track).length,
    keptTies: resolveKeptTies(song, track, readOrderGp5),
  }));
  song.measureHeaders.forEach((_, index) => {
    const tempoChange = tempoChangeAt(song, index);
    song.tracks.forEach((track, trackIndex) => {
      const measure = track.measures[index] ?? { headerIndex: index, clef: 'treble', keySignature: 0, beats: [] };
      const context = contexts[trackIndex] ?? { stringCount: 0, keptTies: new Set() };
      writer.skipBytes(1);
      writeMeasureGp5(writer, measure, trackIndex === 0 && tempoChange !== undefined ? { ...context, tempoChange } : context);
    });
  });
}
