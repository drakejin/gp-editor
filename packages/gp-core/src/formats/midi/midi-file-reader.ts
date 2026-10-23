// Port of TuxGuitar app.tuxguitar.io.midi.MidiFileReader (LGPL-2.1): Standard MIDI File bytes → MidiSequence, every length and count checked.
import { GpFormatError } from '../../errors';
import { decodeWindows1252 } from '../../io/text';
import type { MidiEvent, MidiSequence, MidiTrackEvents } from './midi-sequence';

/** MidiFileHeader.HEADER_MAGIC: "MThd". */
export const MIDI_HEADER_MAGIC: readonly number[] = [0x4d, 0x54, 0x68, 0x64];
const TRACK_MAGIC = 'MTrk';
/** MidiFileHeader.HEADER_LENGTH: format, track count, division. */
const HEADER_LENGTH = 6;
const CHUNK_PREFIX_LENGTH = 8;
/** Bit 15 of the division marks SMPTE time (frames per second and ticks per frame) instead of ticks per quarter note. */
const SMPTE_DIVISION = 0x8000;
const MAX_VARIABLE_LENGTH_BYTES = 4;

/** Bounds on untrusted input: events kept in memory, and the last tick an event may sit at. */
export interface MidiLimits {
  readonly maxEvents: number;
  readonly maxTick: number;
}

export const MIDI_LIMITS: MidiLimits = { maxEvents: 1_000_000, maxTick: 0x7fffffff };

/** Big-endian cursor over bytes[position, end); reading past `end` throws `endMessage`. */
class Cursor {
  constructor(
    private readonly bytes: Uint8Array,
    public position: number,
    private readonly end: number,
    private readonly endMessage: string,
  ) {}

  get remaining(): number {
    return this.end - this.position;
  }

  byte(): number {
    const value = this.position < this.end ? this.bytes[this.position] : undefined;
    if (value === undefined) {
      throw new GpFormatError(this.endMessage);
    }
    this.position += 1;
    return value;
  }

  uint(size: number): number {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = value * 256 + this.byte();
    }
    return value;
  }

  take(length: number): Uint8Array {
    if (length > this.remaining) {
      throw new GpFormatError(this.endMessage);
    }
    this.position += length;
    return this.bytes.subarray(this.position - length, this.position);
  }

  /** MidiFileReader.readVariableLengthQuantity: 7 bits per byte, at most 4 bytes. */
  variableLength(label: string): number {
    let value = 0;
    for (let count = 0; count < MAX_VARIABLE_LENGTH_BYTES; count++) {
      const data = this.byte();
      value = value * 128 + (data & 0x7f);
      if (data < 0x80) {
        return value;
      }
    }
    throw new GpFormatError(`Corrupt MIDI file: variable-length quantity longer than ${MAX_VARIABLE_LENGTH_BYTES} bytes in ${label}`);
  }
}

/** Number of data bytes after a channel message's status (MidiFileReader.getType); undefined for anything else. */
function channelDataLength(status: number): number | undefined {
  const command = status & 0xf0;
  if (status >= 0xf0) {
    return undefined;
  }
  return command === 0xc0 || command === 0xd0 ? 1 : 2;
}

/** Per-track reading state (MidiTrackReaderHelper) and the file-wide event count. */
interface TrackState {
  readonly label: string;
  tick: number;
  runningStatus: number | undefined;
}

function readChannelMessage(cursor: Cursor, state: TrackState, first: number): MidiEvent {
  const isRunning = first < 0x80;
  if (isRunning && state.runningStatus === undefined) {
    throw new GpFormatError(`Corrupt MIDI file: status byte missing in ${state.label}`);
  }
  const status = isRunning ? (state.runningStatus ?? 0) : first;
  state.runningStatus = status;
  const data1 = isRunning ? first : cursor.byte();
  const data2 = channelDataLength(status) === 2 ? cursor.byte() : 0;
  return { kind: 'short', tick: state.tick, command: status & 0xf0, channel: status & 0x0f, data1, data2 };
}

/** MidiFileReader.readEvent: a channel message, a meta event, or undefined for skipped system exclusive and system messages. */
function readEvent(cursor: Cursor, state: TrackState): MidiEvent | undefined {
  const first = cursor.byte();
  if (first < 0xf0) {
    return readChannelMessage(cursor, state, first);
  }
  if (first === 0xf0 || first === 0xf7) {
    // CANCEL_RUNNING_STATUS_ON_META_AND_SYSEX
    state.runningStatus = undefined;
    cursor.take(cursor.variableLength(state.label));
    return undefined;
  }
  if (first === 0xff) {
    state.runningStatus = undefined;
    const type = cursor.byte();
    const data = cursor.take(cursor.variableLength(state.label));
    return { kind: 'meta', tick: state.tick, type, data };
  }
  return undefined;
}

function readTrackEvents(cursor: Cursor, label: string, limits: MidiLimits, eventCount: { value: number }): MidiTrackEvents {
  const events: MidiEvent[] = [];
  const state: TrackState = { label, tick: 0, runningStatus: undefined };
  while (cursor.remaining > 0) {
    state.tick += cursor.variableLength(label);
    if (state.tick > limits.maxTick) {
      throw new GpFormatError(`MIDI ${label} has an event at tick ${state.tick}, past the last tick read (${limits.maxTick})`);
    }
    const event = readEvent(cursor, state);
    if (event !== undefined) {
      eventCount.value += 1;
      if (eventCount.value > limits.maxEvents) {
        throw new GpFormatError(`MIDI file has more than ${limits.maxEvents} events`);
      }
      events.push(event);
    }
  }
  return events;
}

/**
 * MidiFileReader.readTrack: skips chunks that are not MTrk, reads the next MTrk. TuxGuitar pads a skipped chunk to an
 * even length (a RIFF rule); Standard MIDI Files are not padded, so the import skips exactly the chunk's length.
 */
function readTrack(file: Cursor, bytes: Uint8Array, number: number, limits: MidiLimits, eventCount: { value: number }): MidiTrackEvents {
  for (;;) {
    if (file.remaining < CHUNK_PREFIX_LENGTH) {
      throw new GpFormatError(`MIDI file ends before track ${number}`);
    }
    const type = decodeWindows1252(file.take(4));
    const length = file.uint(4);
    if (length > file.remaining) {
      throw new GpFormatError(`Corrupt MIDI file: chunk "${type}" of ${length} bytes runs past the end of the file`);
    }
    if (type === TRACK_MAGIC) {
      const label = `track ${number}`;
      const chunk = new Cursor(bytes, file.position, file.position + length, `Corrupt MIDI file: ${label} ends inside an event`);
      file.position += length;
      return readTrackEvents(chunk, label, limits, eventCount);
    }
    file.take(length);
  }
}

function readResolution(division: number): number {
  if ((division & SMPTE_DIVISION) !== 0) {
    // TuxGuitar's frame-rate check never passes (it negates the unsigned byte), so it rejects every SMPTE file too.
    throw new GpFormatError('MIDI files timed in SMPTE frames are not supported');
  }
  if (division === 0) {
    throw new GpFormatError('Corrupt MIDI file: time division 0');
  }
  return division;
}

function readFormat(file: Cursor): 0 | 1 {
  const format = file.uint(2);
  if (format === 2) {
    throw new GpFormatError('MIDI format 2 (independent sequences) is not supported');
  }
  if (format !== 0 && format !== 1) {
    throw new GpFormatError(`Corrupt MIDI file: unknown format ${format}`);
  }
  return format;
}

/** MidiFileReader.getSequence: the header chunk, then every track. Throws GpFormatError on anything malformed. */
export function readMidiSequence(bytes: Uint8Array, limits: MidiLimits = MIDI_LIMITS): MidiSequence {
  const file = new Cursor(bytes, 0, bytes.length, 'Unexpected end of MIDI file');
  if (!MIDI_HEADER_MAGIC.every((byte) => file.byte() === byte)) {
    throw new GpFormatError('Not a MIDI file: no MThd header');
  }
  const headerLength = file.uint(4);
  if (headerLength < HEADER_LENGTH) {
    throw new GpFormatError(`Corrupt MIDI file: header chunk of ${headerLength} bytes (at least ${HEADER_LENGTH})`);
  }
  const format = readFormat(file);
  const trackCount = file.uint(2);
  if (trackCount === 0) {
    throw new GpFormatError('Corrupt MIDI file: no tracks');
  }
  if (format === 0 && trackCount !== 1) {
    throw new GpFormatError(`Corrupt MIDI file: a format 0 file holds exactly one track, not ${trackCount}`);
  }
  const resolution = readResolution(file.uint(2));
  file.take(headerLength - HEADER_LENGTH);
  const eventCount = { value: 0 };
  const tracks: MidiTrackEvents[] = [];
  for (let number = 1; number <= trackCount; number++) {
    tracks.push(readTrack(file, bytes, number, limits, eventCount));
  }
  return { format, resolution, tracks };
}
