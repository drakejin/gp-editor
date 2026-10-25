import { describe, expect, it } from 'vitest';
import { renderMidi } from '../src/index';
import { variableLength } from '../src/midi/midi-bytes';
import { writeMidiFile } from '../src/midi/midi-file';
import { eventsOf, readMidi } from './helpers/midi-reader';
import { makeSong, note } from './helpers/midi-song';

describe('variableLength', () => {
  it.each([
    [0, [0x00]],
    [0x40, [0x40]],
    [0x7f, [0x7f]],
    [0x80, [0x81, 0x00]],
    [0x2000, [0xc0, 0x00]],
    [0x3fff, [0xff, 0x7f]],
    [0x4000, [0x81, 0x80, 0x00]],
    [0x1fffff, [0xff, 0xff, 0x7f]],
    [0x200000, [0x81, 0x80, 0x80, 0x00]],
    [0x0fffffff, [0xff, 0xff, 0xff, 0x7f]],
  ])('encodes %i as the SMF variable-length quantity %j', (value, expected) => {
    // Act
    const bytes = variableLength(value);

    // Assert
    expect(bytes).toEqual(expected);
  });
});

describe('writeMidiFile', () => {
  it('writes a format 1 header chunk with the division and one MTrk per track', () => {
    // Act
    const file = readMidi(writeMidiFile([[], [], []], 960, 0));

    // Assert
    expect(file.format).toBe(1);
    expect(file.division).toBe(960);
    expect(file.tracks).toHaveLength(3);
  });

  it('starts with the MThd magic and a 6-byte header length', () => {
    // Act
    const bytes = writeMidiFile([[]], 960, 0);

    // Assert
    expect(Array.from(bytes.slice(0, 14))).toEqual([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 0x03, 0xc0]);
  });

  it('sorts events by tick, releases before other events on the same tick, otherwise in insertion order', () => {
    // Arrange
    const track = [
      { tick: 960, data: [0x90, 60, 100] },
      { tick: 0, data: [0x90, 60, 100] },
      { tick: 960, data: [0xe0, 0, 70] },
      { tick: 960, data: [0x80, 60, 100] },
    ];

    // Act
    const file = readMidi(writeMidiFile([track], 960, 0));

    // Assert
    expect(file.tracks[0]?.map((event) => `${event.tick}:${event.kind}`)).toEqual([
      '0:noteOn',
      '960:noteOff',
      '960:noteOn',
      '960:pitchBend',
      '960:endOfTrack',
    ]);
  });

  it('ends a track at its last event or at the given end tick, whichever is later', () => {
    // Act
    const file = readMidi(
      writeMidiFile([[{ tick: 100, data: [0x90, 60, 1] }], [{ tick: 5000, data: [0x80, 60, 1] }]], 960, 3840),
    );

    // Assert
    expect(eventsOf(file, 0, 'endOfTrack')).toEqual([{ kind: 'endOfTrack', tick: 3840 }]);
    expect(eventsOf(file, 1, 'endOfTrack')).toEqual([{ kind: 'endOfTrack', tick: 5000 }]);
  });
});

describe('renderMidi file layout', () => {
  it('writes a conductor track plus one track per song track, named after the song tracks in UTF-8', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        { name: 'Guitare é', measures: [[{ notes: [note({ fret: 0, string: 1 })] }]] },
        { name: '베이스 🎸', measures: [[{ notes: [note({ fret: 0, string: 1 })] }]] },
      ],
    });

    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    expect(file.format).toBe(1);
    expect(file.division).toBe(960);
    expect(file.tracks).toHaveLength(3);
    expect(eventsOf(file, 1, 'trackName').map((event) => event.name)).toEqual(['Guitare é']);
    expect(eventsOf(file, 2, 'trackName').map((event) => event.name)).toEqual(['베이스 🎸']);
  });

  it('ends every track at the end of the last played measure', () => {
    // Arrange
    const song = makeSong({ tracks: [{ measures: [[{ notes: [note({ fret: 0, string: 1 })] }], []] }] });

    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    file.tracks.forEach((_, track) =>
      expect(eventsOf(file, track, 'endOfTrack')).toEqual([{ kind: 'endOfTrack', tick: 7680 }]),
    );
  });
});
