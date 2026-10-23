import { variableLength } from '../../src/midi/midi-bytes';

/**
 * Synthetic Standard MIDI Files for the MIDI import tests: events at absolute ticks, written with delta times, with or
 * without running status, in format 0 or 1, plus raw byte helpers for corrupt files.
 */

/** One event at an absolute tick: its bytes from the status byte on (a meta event starts with 0xFF). */
export interface SmfEvent {
  readonly tick: number;
  readonly bytes: readonly number[];
}

export interface SmfOptions {
  /** 0 or 1 (2 to test the rejection). Default 1. */
  readonly format?: number;
  /** Ticks per quarter note. Default 480. */
  readonly division?: number;
  /** Omit a channel message's status byte when it repeats the previous one. Default false. */
  readonly runningStatus?: boolean;
  /** Overrides the track count written in the header. */
  readonly trackCount?: number;
}

const META = 0xff;
const END_OF_TRACK = [META, 0x2f, 0x00];

export function noteOn(tick: number, channel: number, key: number, velocity = 100): SmfEvent {
  return { tick, bytes: [0x90 | channel, key, velocity] };
}

export function noteOff(tick: number, channel: number, key: number, velocity = 64): SmfEvent {
  return { tick, bytes: [0x80 | channel, key, velocity] };
}

/** A note as a note-on and a note-off (or a note-on with velocity 0 when `zeroVelocityOff`). */
export function note(tick: number, length: number, channel: number, key: number, velocity = 100, zeroVelocityOff = false): SmfEvent[] {
  const off = zeroVelocityOff ? noteOn(tick + length, channel, key, 0) : noteOff(tick + length, channel, key);
  return [noteOn(tick, channel, key, velocity), off];
}

export function programChange(tick: number, channel: number, program: number): SmfEvent {
  return { tick, bytes: [0xc0 | channel, program] };
}

export function controlChange(tick: number, channel: number, controller: number, value: number): SmfEvent {
  return { tick, bytes: [0xb0 | channel, controller, value] };
}

export function meta(tick: number, type: number, data: readonly number[]): SmfEvent {
  return { tick, bytes: [META, type, ...variableLength(data.length), ...data] };
}

export function trackName(tick: number, name: string): SmfEvent {
  return meta(tick, 0x03, [...new TextEncoder().encode(name)]);
}

export function tempo(tick: number, bpm: number): SmfEvent {
  const usq = Math.trunc(60_000_000 / bpm);
  return meta(tick, 0x51, [(usq >> 16) & 0xff, (usq >> 8) & 0xff, usq & 0xff]);
}

/** Time signature numerator / 2^denominatorPower. */
export function timeSignature(tick: number, numerator: number, denominatorPower: number): SmfEvent {
  return meta(tick, 0x58, [numerator, denominatorPower, 24, 8]);
}

/** Key signature: sharps (> 0) or flats (< 0), major or minor. */
export function keySignature(tick: number, sharps: number, isMinor = false): SmfEvent {
  return meta(tick, 0x59, [sharps & 0xff, isMinor ? 1 : 0]);
}

export function sysex(tick: number, data: readonly number[]): SmfEvent {
  return { tick, bytes: [0xf0, ...variableLength(data.length + 1), ...data, 0xf7] };
}

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

export function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function isChannelMessage(status: number | undefined): boolean {
  return status !== undefined && status >= 0x80 && status < 0xf0;
}

/** The MTrk payload: events sorted by tick (stable), delta times, then an end-of-track at the last tick or `endTick`. */
export function trackBytes(events: readonly SmfEvent[], runningStatus = false, endTick?: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const bytes: number[] = [];
  let previousTick = 0;
  let previousStatus: number | undefined;
  for (const event of sorted) {
    bytes.push(...variableLength(event.tick - previousTick));
    const [status, ...data] = event.bytes;
    const isRunning = runningStatus && isChannelMessage(status) && status === previousStatus;
    bytes.push(...(isRunning ? data : event.bytes));
    previousStatus = isChannelMessage(status) ? status : undefined;
    previousTick = event.tick;
  }
  bytes.push(...variableLength(Math.max(previousTick, endTick ?? previousTick) - previousTick), ...END_OF_TRACK);
  return bytes;
}

export function chunk(type: string, payload: readonly number[]): number[] {
  return [...new TextEncoder().encode(type), ...uint32(payload.length), ...payload];
}

export function headerChunk(format: number, trackCount: number, division: number): number[] {
  return chunk('MThd', [...uint16(format), ...uint16(trackCount), ...uint16(division)]);
}

/** A whole file: the header chunk, then one MTrk per entry of `tracks`. */
export function buildSmf(tracks: readonly (readonly SmfEvent[])[], options: SmfOptions = {}): Uint8Array {
  const format = options.format ?? 1;
  const header = headerChunk(format, options.trackCount ?? tracks.length, options.division ?? 480);
  const chunks = tracks.flatMap((events) => chunk('MTrk', trackBytes(events, options.runningStatus ?? false)));
  return new Uint8Array([...header, ...chunks]);
}
