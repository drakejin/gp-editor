import { describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL, readSong, renderMidi } from '../src/index';
import { buildChannelRoutes } from '../src/midi/channel-routes';
import { loadFixture } from './helpers/fixtures';
import { eventsOf, type MidiFile, playedNotes, readMidi } from './helpers/midi-reader';
import { makeSong, note } from './helpers/midi-song';

function channel(id: number, isPercussion = false): typeof DEFAULT_CHANNEL & { id: number } {
  return { ...DEFAULT_CHANNEL, id, isPercussion };
}

/** controller → value of the control changes on one MIDI channel of one track, at tick 0. */
function controllersAtStart(file: MidiFile, track: number, midiChannel: number): Map<number, number> {
  return new Map(
    eventsOf(file, track, 'controlChange')
      .filter((event) => event.channel === midiChannel && event.tick === 0)
      .map((event) => [event.controller, event.value]),
  );
}

describe('buildChannelRoutes (GMChannelRouter default routes)', () => {
  it('gives each melodic channel two free MIDI channels, skipping the percussion channel 9', () => {
    // Act
    const routes = buildChannelRoutes([1, 2, 3, 4, 5].map((id) => channel(id)));

    // Assert
    expect([...routes.values()]).toEqual([
      { channelId: 1, channel1: 0, channel2: 1 },
      { channelId: 2, channel1: 2, channel2: 3 },
      { channelId: 3, channel1: 4, channel2: 5 },
      { channelId: 4, channel1: 6, channel2: 7 },
      { channelId: 5, channel1: 8, channel2: 10 },
    ]);
  });

  it('routes every percussion channel to MIDI channel 9', () => {
    // Act
    const routes = buildChannelRoutes([channel(7, true), channel(8), channel(9, true)]);

    // Assert
    expect(routes.get(7)).toEqual({ channelId: 7, channel1: 9, channel2: 9 });
    expect(routes.get(8)).toEqual({ channelId: 8, channel1: 0, channel2: 1 });
    expect(routes.get(9)).toEqual({ channelId: 9, channel1: 9, channel2: 9 });
  });

  it('shares the last free channel when eight melodic channels need routes', () => {
    // Act
    const routes = buildChannelRoutes(Array.from({ length: 8 }, (_, i) => channel(i + 1)));

    // Assert: the same routes TuxGuitar's default router gives.
    expect(routes.get(7)).toEqual({ channelId: 7, channel1: 13, channel2: 14 });
    expect(routes.get(8)).toEqual({ channelId: 8, channel1: 15, channel2: 15 });
  });

  it('gives later channels a single MIDI channel so that up to fifteen melodic channels all get their own', () => {
    // Act
    const routes = buildChannelRoutes([...Array.from({ length: 10 }, (_, i) => channel(i + 1)), channel(11, true)]);

    // Assert
    expect([...routes.values()].map((route) => [route.channel1, route.channel2])).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 10],
      [11, 11],
      [12, 12],
      [13, 13],
      [14, 14],
      [15, 15],
      [9, 9],
    ]);
  });

  it('leaves melodic channels beyond fifteen unrouted (-1) like TuxGuitar', () => {
    // Act
    const routes = buildChannelRoutes(Array.from({ length: 16 }, (_, i) => channel(i + 1)));

    // Assert
    expect(routes.get(15)).toEqual({ channelId: 15, channel1: 15, channel2: 15 });
    expect(routes.get(16)).toEqual({ channelId: 16, channel1: -1, channel2: -1 });
  });

  it('plays an unrouted channel on MIDI channel 0, as TuxGuitar does', () => {
    // Arrange
    const song = makeSong({
      tracks: Array.from({ length: 16 }, (_, i) => ({
        channelId: i + 1,
        measures: [[{ notes: [note({ fret: i, string: 1 })] }]],
      })),
    });

    // Act
    const notes = playedNotes(readMidi(renderMidi(song).bytes));

    // Assert
    expect(notes.find((played) => played.track === 16)?.channel).toBe(0);
  });
});

describe('renderMidi channel setup (MidiSequenceParser.makeTrackChannel)', () => {
  const song = makeSong({
    tracks: [
      { channelId: 1, measures: [[{ notes: [note({ fret: 0, string: 1 })] }]] },
      { channelId: 2, measures: [[{ notes: [note({ fret: 0, string: 1 })] }]] },
    ],
    channels: [
      { id: 1, program: 30, bank: 0, volume: 100, balance: 20, chorus: 3, reverb: 4, phaser: 5, tremolo: 6 },
      { id: 2, program: 33, bank: 5, volume: 90, balance: 100, chorus: 7, reverb: 8, phaser: 9, tremolo: 10 },
    ],
  });
  const file = readMidi(renderMidi(song).bytes);

  it.each([
    [1, 0],
    [1, 1],
  ])(
    'sets volume, pan, chorus, reverb, phaser, tremolo, expression and bank of track %i on MIDI channel %i',
    (track, midiChannel) => {
      // Act
      const controllers = controllersAtStart(file, track, midiChannel);

      // Assert
      expect(Object.fromEntries(controllers)).toEqual({ 0: 0, 7: 100, 10: 20, 93: 3, 91: 4, 95: 5, 92: 6, 11: 127 });
    },
  );

  it('sets up the second channel on its own pair of MIDI channels', () => {
    // Act
    const controllers = controllersAtStart(file, 2, 3);

    // Assert
    expect(Object.fromEntries(controllers)).toEqual({ 0: 5, 7: 90, 10: 100, 93: 7, 91: 8, 95: 9, 92: 10, 11: 127 });
  });

  it('sends the program after the bank select, on both channels of the route', () => {
    // Act
    const programs = [1, 2].map((track) =>
      eventsOf(file, track, 'programChange').map((event) => [event.channel, event.program]),
    );
    const firstTrack = file.tracks[1]?.filter(
      (event) => event.kind === 'controlChange' || event.kind === 'programChange',
    );

    // Assert
    expect(programs).toEqual([
      [
        [0, 30],
        [1, 30],
      ],
      [
        [2, 33],
        [3, 33],
      ],
    ]);
    expect(firstTrack?.at(-2)).toMatchObject({ kind: 'programChange', channel: 0 });
  });

  it('centres the pitch wheel of each track before playing', () => {
    // Act
    const bends = eventsOf(file, 1, 'pitchBend');

    // Assert
    expect(bends[0]).toEqual({ kind: 'pitchBend', tick: 0, channel: 0, lsb: 0, msb: 64 });
  });

  it('sets a pitch-bend range of 12 semitones on every routed MIDI channel in the conductor track', () => {
    // Act
    const rpn = eventsOf(file, 0, 'controlChange').map(
      (event) => `${event.channel}:${event.controller}=${event.value}`,
    );

    // Assert
    const setup: [number, number][] = [
      [101, 0],
      [100, 0],
      [6, 12],
      [38, 0],
    ];
    expect(rpn).toEqual(
      [
        [0, 1],
        [2, 3],
      ].flatMap((route) =>
        setup.flatMap(([controller, value]) => route.map((midi) => `${midi}:${controller}=${value}`)),
      ),
    );
  });
});

describe('renderMidi percussion', () => {
  const song = readSong(loadFixture('guitarpro5', 'percussion-all.gp5'));
  const file = readMidi(renderMidi(song).bytes);

  it('plays percussion-all.gp5 on MIDI channel 9 with the fret as the GM drum key', () => {
    // Act
    const notes = playedNotes(file);

    // Assert
    expect(new Set(notes.map((played) => played.channel))).toEqual(new Set([9]));
    expect(notes.slice(0, 5).map((played) => [played.key, played.start, played.end, played.velocity])).toEqual([
      [27, 0, 960, 95],
      [28, 960, 1920, 95],
      [29, 1920, 2880, 95],
      [30, 2880, 3840, 95],
      [31, 3840, 4800, 95],
    ]);
  });

  it('sets program 0 on channel 9 and leaves its drum bank to the synthesizer', () => {
    // Act
    const programs = eventsOf(file, 1, 'programChange');
    const bankSelects = eventsOf(file, 1, 'controlChange').filter((event) => event.controller === 0);

    // Assert
    expect(programs).toEqual([{ kind: 'programChange', tick: 0, channel: 9, program: 0 }]);
    expect(bankSelects).toEqual([]);
  });

  it('ignores tuning and capo on percussion tracks', () => {
    // Arrange
    const drums = makeSong({
      tracks: [
        { isPercussion: true, offset: 3, tuning: [40, 40], measures: [[{ notes: [note({ fret: 38, string: 2 })] }]] },
      ],
    });

    // Act
    const notes = playedNotes(readMidi(renderMidi(drums).bytes));

    // Assert
    expect(notes.map((played) => [played.channel, played.key])).toEqual([[9, 38]]);
  });
});
