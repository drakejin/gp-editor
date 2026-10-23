import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import { MIDI_LIMITS, readMidiSequence } from '../src/formats/midi/midi-file-reader';
import type { MidiEvent } from '../src/formats/midi/midi-sequence';
import {
  buildSmf,
  chunk,
  controlChange,
  headerChunk,
  meta,
  note,
  noteOn,
  programChange,
  sysex,
  tempo,
  trackBytes,
  trackName,
} from './helpers/smf-builder';

function shortEvents(events: readonly MidiEvent[]): unknown[] {
  return events.flatMap((event) =>
    event.kind === 'short' ? [[event.tick, event.command, event.channel, event.data1, event.data2]] : [],
  );
}

function fileOf(...parts: readonly (readonly number[])[]): Uint8Array {
  return new Uint8Array(parts.flat());
}

describe('readMidiSequence: structure', () => {
  it('reads the format, the resolution and every track with absolute ticks', () => {
    // Arrange
    const bytes = buildSmf(
      [
        [tempo(0, 100), trackName(0, 'Song')],
        [programChange(0, 2, 30), ...note(0, 480, 2, 60), ...note(960, 240, 2, 62)],
      ],
      { format: 1, division: 480 },
    );

    // Act
    const sequence = readMidiSequence(bytes);

    // Assert
    expect(sequence.format).toBe(1);
    expect(sequence.resolution).toBe(480);
    expect(sequence.tracks).toHaveLength(2);
    expect(shortEvents(sequence.tracks[1] ?? [])).toEqual([
      [0, 0xc0, 2, 30, 0],
      [0, 0x90, 2, 60, 100],
      [480, 0x80, 2, 60, 64],
      [960, 0x90, 2, 62, 100],
      [1200, 0x80, 2, 62, 64],
    ]);
  });

  it('decodes running status like the full status bytes', () => {
    // Arrange
    const events = [...note(0, 100, 0, 60), ...note(50, 100, 0, 64), controlChange(60, 0, 7, 90), controlChange(70, 0, 10, 20)];

    // Act
    const plain = readMidiSequence(buildSmf([events]));
    const running = readMidiSequence(buildSmf([events], { runningStatus: true }));

    // Assert
    expect(buildSmf([events], { runningStatus: true }).length).toBeLessThan(buildSmf([events]).length);
    expect(shortEvents(running.tracks[0] ?? [])).toEqual(shortEvents(plain.tracks[0] ?? []));
  });

  it('keeps meta events with their type and data and skips system exclusive messages', () => {
    // Arrange
    const bytes = buildSmf([[trackName(0, 'Lead'), sysex(10, [0x41, 0x10]), tempo(20, 120)]]);

    // Act
    const [track] = readMidiSequence(bytes).tracks;

    // Assert
    const metas = (track ?? []).flatMap((event) => (event.kind === 'meta' ? [[event.tick, event.type, [...event.data]]] : []));
    expect(metas).toEqual([
      [0, 0x03, [...new TextEncoder().encode('Lead')]],
      [20, 0x51, [0x07, 0xa1, 0x20]],
      [20, 0x2f, []],
    ]);
  });

  it('skips chunks that are not tracks', () => {
    // Arrange
    const bytes = fileOf(headerChunk(1, 1, 96), chunk('XFIH', [1, 2, 3]), chunk('MTrk', trackBytes(note(0, 96, 0, 60))));

    // Act
    const sequence = readMidiSequence(bytes);

    // Assert
    expect(shortEvents(sequence.tracks[0] ?? [])).toHaveLength(2);
  });

  it('ignores system common messages, as TuxGuitar does', () => {
    // Arrange: delta 0, tune request (0xF6), then a note-on.
    const payload = [0x00, 0xf6, 0x00, 0x90, 60, 100, 0x10, 0x80, 60, 0, 0x00, 0xff, 0x2f, 0x00];
    const bytes = fileOf(headerChunk(0, 1, 96), chunk('MTrk', payload));

    // Act
    const sequence = readMidiSequence(bytes);

    // Assert
    expect(shortEvents(sequence.tracks[0] ?? [])).toEqual([
      [0, 0x90, 0, 60, 100],
      [16, 0x80, 0, 60, 0],
    ]);
  });
});

describe('readMidiSequence: corrupt files', () => {
  const track = chunk('MTrk', trackBytes(note(0, 96, 0, 60)));

  it.each([
    ['a wrong header magic', fileOf([0x4d, 0x54, 0x68, 0x65, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96], track), /MThd/],
    ['a header shorter than 6 bytes', fileOf(chunk('MThd', [0, 0, 0, 1]), track), /header/],
    ['format 2', fileOf(headerChunk(2, 1, 96), track), /format 2/],
    ['an unknown format', fileOf(headerChunk(7, 1, 96), track), /format 7/],
    ['no tracks', fileOf(headerChunk(1, 0, 96)), /track/],
    ['a format 0 file with two tracks', fileOf(headerChunk(0, 2, 96), track, track), /format 0/],
    ['a zero time division', fileOf(headerChunk(1, 1, 0), track), /division/],
    ['an SMPTE time division (as TuxGuitar)', fileOf(headerChunk(1, 1, ((256 - 25) << 8) | 40), track), /SMPTE/],
    ['a missing track chunk', fileOf(headerChunk(1, 2, 96), track), /track 2/],
    ['a truncated header', new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0]), /end/],
  ])('rejects %s', (_, bytes, message) => {
    // Act
    const act = () => readMidiSequence(bytes);

    // Assert
    expect(act).toThrow(GpFormatError);
    expect(act).toThrow(message);
  });

  it('rejects a chunk longer than the file', () => {
    // Arrange
    const payload = trackBytes(note(0, 96, 0, 60));
    const bytes = fileOf(headerChunk(0, 1, 96), [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0x10, 0], payload);

    // Act / Assert
    expect(() => readMidiSequence(bytes)).toThrow(/chunk/);
  });

  it('rejects a data byte with no running status to apply', () => {
    // Arrange: a meta event cancels the running status, then a bare data byte follows.
    const payload = [0x00, 0x90, 60, 100, 0x00, ...meta(0, 0x01, [0x41]).bytes, 0x00, 62, 100, 0x00, 0xff, 0x2f, 0x00];
    const bytes = fileOf(headerChunk(0, 1, 96), chunk('MTrk', payload));

    // Act / Assert
    expect(() => readMidiSequence(bytes)).toThrow(/status byte/);
  });

  it('rejects a variable-length quantity longer than 4 bytes', () => {
    // Arrange
    const bytes = fileOf(headerChunk(0, 1, 96), chunk('MTrk', [0x81, 0x81, 0x81, 0x81, 0x01, 0x90, 60, 100]));

    // Act / Assert
    expect(() => readMidiSequence(bytes)).toThrow(/variable-length/);
  });

  it('rejects a meta event whose data runs past its track chunk', () => {
    // Arrange
    const padding = Array.from({ length: 40 }, () => 0);
    const bytes = fileOf(headerChunk(0, 1, 96), chunk('MTrk', [0x00, 0xff, 0x03, 0x20, 0x41, 0x42]), padding);

    // Act / Assert
    expect(() => readMidiSequence(bytes)).toThrow(/track 1/);
  });

  it('rejects a channel message cut off by the end of its track chunk', () => {
    // Arrange
    const bytes = fileOf(headerChunk(0, 1, 96), chunk('MTrk', [0x00, 0x90, 60]), chunk('MTrk', [0x00, 0xff, 0x2f, 0x00]));

    // Act / Assert
    expect(() => readMidiSequence(bytes)).toThrow(/track 1/);
  });

  it('rejects files with more events than the limit', () => {
    // Arrange
    const bytes = buildSmf([[...note(0, 10, 0, 60), ...note(20, 10, 0, 62)]]);

    // Act / Assert
    expect(() => readMidiSequence(bytes, { ...MIDI_LIMITS, maxEvents: 3 })).toThrow(/events/);
  });

  it('rejects events past the last tick the reader accepts', () => {
    // Arrange
    const bytes = buildSmf([[noteOn(5000, 0, 60)]]);

    // Act / Assert
    expect(() => readMidiSequence(bytes, { ...MIDI_LIMITS, maxTick: 4000 })).toThrow(/tick/);
  });
});
