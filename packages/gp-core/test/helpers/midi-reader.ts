/**
 * Minimal Standard MIDI File parser for tests: decodes the header chunk and every track's events
 * (channel messages with running status, meta events, sysex skipped) with absolute ticks.
 */

export type MidiEvent =
  | {
      readonly kind: 'noteOn' | 'noteOff';
      readonly tick: number;
      readonly channel: number;
      readonly key: number;
      readonly velocity: number;
    }
  | {
      readonly kind: 'controlChange';
      readonly tick: number;
      readonly channel: number;
      readonly controller: number;
      readonly value: number;
    }
  | { readonly kind: 'programChange'; readonly tick: number; readonly channel: number; readonly program: number }
  | {
      readonly kind: 'pitchBend';
      readonly tick: number;
      readonly channel: number;
      readonly lsb: number;
      readonly msb: number;
    }
  | { readonly kind: 'other'; readonly tick: number; readonly status: number }
  | { readonly kind: 'tempo'; readonly tick: number; readonly usq: number }
  | {
      readonly kind: 'timeSignature';
      readonly tick: number;
      readonly numerator: number;
      readonly denominator: number;
      readonly clocks: number;
      readonly notated32nds: number;
    }
  | { readonly kind: 'trackName'; readonly tick: number; readonly name: string }
  | { readonly kind: 'endOfTrack'; readonly tick: number }
  | { readonly kind: 'meta'; readonly tick: number; readonly type: number; readonly data: readonly number[] };

export interface MidiFile {
  readonly format: number;
  readonly division: number;
  readonly tracks: readonly (readonly MidiEvent[])[];
}

/** A sounding note: a note-on paired with the next note-off (or velocity-0 note-on) of the same channel and key. */
export interface PlayedNote {
  readonly track: number;
  readonly channel: number;
  readonly key: number;
  readonly velocity: number;
  readonly start: number;
  /** undefined when the note is never released. */
  readonly end: number | undefined;
}

class Cursor {
  position = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get length(): number {
    return this.bytes.length;
  }

  byte(): number {
    const value = this.bytes[this.position];
    if (value === undefined) {
      throw new Error(`unexpected end of MIDI data at ${this.position}`);
    }
    this.position += 1;
    return value;
  }

  peek(): number {
    const value = this.bytes[this.position];
    if (value === undefined) {
      throw new Error(`unexpected end of MIDI data at ${this.position}`);
    }
    return value;
  }

  uint(size: number): number {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = value * 256 + this.byte();
    }
    return value;
  }

  text(size: number): string {
    return String.fromCharCode(...this.take(size));
  }

  take(size: number): number[] {
    return Array.from({ length: size }, () => this.byte());
  }

  variableLength(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.byte();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return value;
      }
    }
    throw new Error('variable-length quantity longer than 4 bytes');
  }
}

function decodeUtf8(bytes: readonly number[]): string {
  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
}

function readMeta(cursor: Cursor, tick: number): MidiEvent {
  const type = cursor.byte();
  const data = cursor.take(cursor.variableLength());
  const at = (index: number): number => data[index] ?? 0;
  switch (type) {
    case 0x03:
      return { kind: 'trackName', tick, name: decodeUtf8(data) };
    case 0x2f:
      return { kind: 'endOfTrack', tick };
    case 0x51:
      return { kind: 'tempo', tick, usq: (at(0) << 16) | (at(1) << 8) | at(2) };
    case 0x58:
      return {
        kind: 'timeSignature',
        tick,
        numerator: at(0),
        denominator: 2 ** at(1),
        clocks: at(2),
        notated32nds: at(3),
      };
    default:
      return { kind: 'meta', tick, type, data };
  }
}

function readChannelMessage(cursor: Cursor, status: number, tick: number): MidiEvent {
  const channel = status & 0x0f;
  const data1 = cursor.byte();
  switch (status & 0xf0) {
    case 0x80:
      return { kind: 'noteOff', tick, channel, key: data1, velocity: cursor.byte() };
    case 0x90:
      return { kind: 'noteOn', tick, channel, key: data1, velocity: cursor.byte() };
    case 0xb0:
      return { kind: 'controlChange', tick, channel, controller: data1, value: cursor.byte() };
    case 0xc0:
      return { kind: 'programChange', tick, channel, program: data1 };
    case 0xd0:
      return { kind: 'other', tick, status };
    case 0xe0:
      return { kind: 'pitchBend', tick, channel, lsb: data1, msb: cursor.byte() };
    default:
      cursor.byte();
      return { kind: 'other', tick, status };
  }
}

function readTrack(cursor: Cursor, end: number): MidiEvent[] {
  const events: MidiEvent[] = [];
  let tick = 0;
  let runningStatus = 0;
  while (cursor.position < end) {
    tick += cursor.variableLength();
    const first = cursor.peek();
    const status = first >= 0x80 ? cursor.byte() : runningStatus;
    if (status === 0xff) {
      events.push(readMeta(cursor, tick));
    } else if (status === 0xf0 || status === 0xf7) {
      cursor.take(cursor.variableLength());
    } else {
      if (status < 0x80) {
        throw new Error(`data byte without status at ${cursor.position}`);
      }
      runningStatus = status;
      events.push(readChannelMessage(cursor, status, tick));
    }
  }
  if (cursor.position !== end) {
    throw new Error(`track chunk overran its length (${cursor.position} > ${end})`);
  }
  return events;
}

/** Parses a Standard MIDI File; throws on malformed chunks. */
export function readMidi(bytes: Uint8Array): MidiFile {
  const cursor = new Cursor(bytes);
  if (cursor.text(4) !== 'MThd' || cursor.uint(4) !== 6) {
    throw new Error('missing MThd header chunk');
  }
  const format = cursor.uint(2);
  const trackCount = cursor.uint(2);
  const division = cursor.uint(2);
  const tracks: MidiEvent[][] = [];
  for (let i = 0; i < trackCount; i++) {
    if (cursor.text(4) !== 'MTrk') {
      throw new Error(`missing MTrk chunk ${i}`);
    }
    const length = cursor.uint(4);
    tracks.push(readTrack(cursor, cursor.position + length));
  }
  if (cursor.position !== cursor.length) {
    throw new Error('trailing bytes after the last track');
  }
  return { format, division, tracks };
}

function isRelease(event: MidiEvent): boolean {
  return event.kind === 'noteOff' || (event.kind === 'noteOn' && event.velocity === 0);
}

/** Every note of every track, paired note-on → note-off in file order, sorted by start then track. */
export function playedNotes(file: MidiFile): PlayedNote[] {
  const notes: PlayedNote[] = [];
  file.tracks.forEach((events, track) => {
    const open = new Map<string, { channel: number; key: number; velocity: number; start: number }[]>();
    const finished: PlayedNote[] = [];
    for (const event of events) {
      if (event.kind !== 'noteOn' && event.kind !== 'noteOff') {
        continue;
      }
      const id = `${event.channel}:${event.key}`;
      const pending = open.get(id) ?? [];
      if (isRelease(event)) {
        const started = pending.shift();
        if (started !== undefined) {
          finished.push({ track, ...started, end: event.tick });
        }
      } else {
        open.set(id, [
          ...pending,
          { channel: event.channel, key: event.key, velocity: event.velocity, start: event.tick },
        ]);
      }
    }
    const hanging = [...open.values()].flat().map((started) => ({ track, ...started, end: undefined }));
    notes.push(...finished, ...hanging);
  });
  return notes.sort((a, b) => a.start - b.start || a.track - b.track || a.key - b.key);
}

/** Events of one kind from one track. */
export function eventsOf<K extends MidiEvent['kind']>(
  file: MidiFile,
  track: number,
  kind: K,
): Extract<MidiEvent, { kind: K }>[] {
  const events = file.tracks[track] ?? [];
  return events.filter((event): event is Extract<MidiEvent, { kind: K }> => event.kind === kind);
}
