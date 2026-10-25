// Port of TuxGuitar app.tuxguitar.io.midi.MidiFileWriter (LGPL-2.1): a format 1 Standard MIDI File.
import { variableLengthSize, writeVariableLength } from './midi-bytes';

/** One encoded MIDI message (status byte first, or 0xFF type length data for a meta event) at a tick. */
export interface MidiMessage {
  readonly tick: number;
  readonly data: readonly number[];
}

const HEADER_MAGIC = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
const TRACK_MAGIC = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
const HEADER_LENGTH = 6;
const FORMAT_MULTI_TRACK = 1;
const END_OF_TRACK = [0xff, 0x2f, 0x00];
const STATUS_MASK = 0xf0;
const NOTE_OFF = 0x80;

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * MidiTrack.sort is a stable sort by tick. A note-off moves ahead of the other messages of its tick, so a note
 * struck again on the tick another one of the same key ends is not cut short.
 */
function sortMessages(messages: readonly MidiMessage[]): MidiMessage[] {
  const rank = (message: MidiMessage): number => (((message.data[0] ?? 0) & STATUS_MASK) === NOTE_OFF ? 0 : 1);
  return [...messages].sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
}

/** Bytes of `data` written into `bytes` from `offset`; the offset after them. */
function writeData(bytes: Uint8Array, offset: number, data: readonly number[]): number {
  bytes.set(data, offset);
  return offset + data.length;
}

/**
 * One MTrk chunk: its events, ended (MidiSequence.finish) at its last event or at `endTick`, whichever is later.
 * Sized first, then written into one byte array (no growing list of numbers: a track has thousands of events).
 */
function trackChunk(messages: readonly MidiMessage[], endTick: number): Uint8Array {
  const sorted = sortMessages(messages);
  const lastTick = sorted[sorted.length - 1]?.tick ?? 0;
  const endDelta = Math.max(endTick, lastTick) - lastTick;
  let size = variableLengthSize(endDelta) + END_OF_TRACK.length;
  let previousTick = 0;
  for (const message of sorted) {
    size += variableLengthSize(message.tick - previousTick) + message.data.length;
    previousTick = message.tick;
  }
  const chunk = new Uint8Array(TRACK_MAGIC.length + 4 + size);
  let offset = writeData(chunk, writeData(chunk, 0, TRACK_MAGIC), uint32(size));
  previousTick = 0;
  for (const message of sorted) {
    offset = writeData(chunk, writeVariableLength(chunk, offset, message.tick - previousTick), message.data);
    previousTick = message.tick;
  }
  writeData(chunk, writeVariableLength(chunk, offset, endDelta), END_OF_TRACK);
  return chunk;
}

/** A format 1 file: one MTrk per entry of `tracks`, `division` ticks per quarter note. */
export function writeMidiFile(
  tracks: readonly (readonly MidiMessage[])[],
  division: number,
  endTick: number,
): Uint8Array {
  const header = [
    ...HEADER_MAGIC,
    ...uint32(HEADER_LENGTH),
    ...uint16(FORMAT_MULTI_TRACK),
    ...uint16(tracks.length),
    ...uint16(division),
  ];
  const chunks = tracks.map((messages) => trackChunk(messages, endTick));
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, header.length));
  bytes.set(header, 0);
  let offset = header.length;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
