// Port of TuxGuitar app.tuxguitar.io.midi.MidiFileWriter (LGPL-2.1): a format 1 Standard MIDI File.
import { pushVariableLength } from './midi-bytes';

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

function appendAll(target: number[], bytes: readonly number[]): void {
  for (const byte of bytes) {
    target.push(byte);
  }
}

/**
 * MidiTrack.sort is a stable sort by tick. A note-off moves ahead of the other messages of its tick, so a note
 * struck again on the tick another one of the same key ends is not cut short.
 */
function sortMessages(messages: readonly MidiMessage[]): MidiMessage[] {
  const rank = (message: MidiMessage): number => (((message.data[0] ?? 0) & STATUS_MASK) === NOTE_OFF ? 0 : 1);
  return [...messages].sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
}

/** Events of one MTrk chunk, ended (MidiSequence.finish) at its last event or at `endTick`, whichever is later. */
function trackEvents(messages: readonly MidiMessage[], endTick: number): number[] {
  const events: number[] = [];
  let previousTick = 0;
  const sorted = sortMessages(messages);
  for (const message of sorted) {
    pushVariableLength(events, message.tick - previousTick);
    appendAll(events, message.data);
    previousTick = message.tick;
  }
  pushVariableLength(events, Math.max(endTick, previousTick) - previousTick);
  appendAll(events, END_OF_TRACK);
  return events;
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
  const chunks = tracks.map((messages) => {
    const events = trackEvents(messages, endTick);
    return { prefix: [...TRACK_MAGIC, ...uint32(events.length)], events };
  });
  const size = chunks.reduce((total, chunk) => total + chunk.prefix.length + chunk.events.length, header.length);
  const bytes = new Uint8Array(size);
  bytes.set(header, 0);
  let offset = header.length;
  for (const chunk of chunks) {
    bytes.set(chunk.prefix, offset);
    bytes.set(chunk.events, offset + chunk.prefix.length);
    offset += chunk.prefix.length + chunk.events.length;
  }
  return bytes;
}
