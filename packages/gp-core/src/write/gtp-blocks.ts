// Port of TuxGuitar GP3/GP4/GP5OutputStream#writeColor / #writeLyrics / #writeTrack (LGPL-2.1): blocks the three layouts share.
import type { Rgb, Track } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { type ChannelTable, trackChannels } from './gp-channels';
import { MAX_STRINGS, resolveLyricTrack, writableStrings } from './gtp-song';

const LYRIC_LINES = 5;
const TRACK_NAME_SIZE = 40;
const DEFAULT_FRET_COUNT = 24;
const UNUSED_FIRST_TRACK_TUNING = -1;
/** Guitar Pro 3–5 use MIDI port 1 … 4; channels of port 2 and above are read as port 1's. */
const MIDI_PORT = 1;

export function writeColor(writer: ByteWriter, color: Rgb): void {
  writer.writeUnsignedByte(color.r).writeUnsignedByte(color.g).writeUnsignedByte(color.b).writeByte(0);
}

/** GP4/GP5 lyrics: the lyric track (0 = none), then five lines; Guitar Pro starts unused lines at measure 1. */
export function writeLyrics(writer: ByteWriter, tracks: readonly Track[]): void {
  const lyricTrack = resolveLyricTrack(tracks);
  writer.writeInt(lyricTrack?.number ?? 0);
  writer.writeInt(lyricTrack?.lyrics.from ?? 1).writeStringInteger(lyricTrack?.lyrics.text ?? '');
  for (let line = 1; line < LYRIC_LINES; line++) {
    writer.writeInt(1).writeStringInteger('');
  }
}

/**
 * The part of a track every GP3–GP5 file has: flags, name, strings (seven slots), MIDI port and channels,
 * fret count, capo and colour. Guitar Pro leaves -1 in the unused string slots of the first track, 0 in
 * the others'.
 */
export function writeTrackBlock(writer: ByteWriter, track: Track, flags: number, table: ChannelTable): void {
  const strings = writableStrings(track);
  const unusedTuning = track.number === 1 ? UNUSED_FIRST_TRACK_TUNING : 0;
  const route = trackChannels(table, track.channelId);
  writer.writeUnsignedByte(flags).writeStringByte(track.name, TRACK_NAME_SIZE);
  writer.writeInt(strings.length);
  for (let i = 0; i < MAX_STRINGS; i++) {
    writer.writeInt(strings[i]?.tuning ?? unusedTuning);
  }
  writer.writeInt(MIDI_PORT).writeInt(route.channel1 + 1).writeInt(route.channel2 + 1);
  writer.writeInt(DEFAULT_FRET_COUNT).writeInt(track.offset);
  writeColor(writer, track.color);
}
