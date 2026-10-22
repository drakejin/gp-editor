import { describe, expect, it } from 'vitest';
import { readSong, renderMidi, type Song } from '../src/index';
import { loadFixture } from './helpers/fixtures';
import { eventsOf, type PlayedNote, playedNotes, readMidi } from './helpers/midi-reader';
import { makeSong, note, type TrackSpec } from './helpers/midi-song';

function trackOf(fret: number, extra: Partial<TrackSpec> = {}): TrackSpec {
  return {
    measures: [[{ notes: [note({ fret, string: 1 })] }], [{ notes: [note({ fret: fret + 1, string: 1 })] }]],
    ...extra,
  };
}

function sounding(song: Song, options?: Parameters<typeof renderMidi>[1]): PlayedNote[] {
  return playedNotes(readMidi(renderMidi(song, options).bytes));
}

function keysByTrack(notes: readonly PlayedNote[]): Record<number, number[]> {
  const result: Record<number, number[]> = {};
  for (const played of notes) {
    result[played.track] = [...(result[played.track] ?? []), played.key];
  }
  return result;
}

describe('renderMidi track selection', () => {
  it('plays every track by default', () => {
    // Arrange
    const song = makeSong({ tracks: [trackOf(0), trackOf(5)] });

    // Act / Assert
    expect(keysByTrack(sounding(song))).toEqual({ 1: [64, 65], 2: [69, 70] });
  });

  it('silences a muted track but keeps its channel setup', () => {
    // Arrange
    const song = makeSong({ tracks: [trackOf(0, { mute: true }), trackOf(5)] });

    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    expect(keysByTrack(playedNotes(file))).toEqual({ 2: [69, 70] });
    expect(eventsOf(file, 1, 'programChange')).toHaveLength(2);
  });

  it('plays only the solo tracks when any track is solo, even a muted solo track stays silent', () => {
    // Arrange
    const song = makeSong({
      tracks: [trackOf(0, { solo: true }), trackOf(5), trackOf(10, { solo: true, mute: true })],
    });

    // Act / Assert
    expect(keysByTrack(sounding(song))).toEqual({ 1: [64, 65] });
  });

  it('plays exactly the requested trackIndexes, whatever solo and mute say', () => {
    // Arrange
    const song = makeSong({ tracks: [trackOf(0, { solo: true }), trackOf(5, { mute: true }), trackOf(10)] });

    // Act / Assert
    expect(keysByTrack(sounding(song, { trackIndexes: [1, 2] }))).toEqual({ 2: [69, 70], 3: [74, 75] });
  });

  it('leaves a track without a channel empty, as TuxGuitar skips it', () => {
    // Arrange
    const song = makeSong({ tracks: [trackOf(0), trackOf(5, { channelId: 7 })], channels: [{ id: 1 }] });

    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    expect(file.tracks[2]?.map((event) => event.kind)).toEqual(['endOfTrack']);
    expect(keysByTrack(playedNotes(file))).toEqual({ 1: [64, 65] });
  });

  it('skips notes on a string the track does not have', () => {
    // Arrange
    const song = makeSong({
      tracks: [{ tuning: [64], measures: [[{ notes: [note({ fret: 0, string: 2 }), note({ fret: 1, string: 1 })] }]] }],
    });

    // Act / Assert
    expect(sounding(song).map((played) => played.key)).toEqual([65]);
  });

  it('keeps one MIDI track per song track whatever is played', () => {
    // Arrange
    const song = makeSong({ tracks: [trackOf(0), trackOf(5)] });

    // Act
    const file = readMidi(renderMidi(song, { trackIndexes: [] }).bytes);

    // Assert
    expect(file.tracks).toHaveLength(3);
    expect(playedNotes(file)).toEqual([]);
  });
});

describe('renderMidi fromHeaderIndex', () => {
  it('skips the measures before fromHeaderIndex and starts the file at that measure', () => {
    // Arrange
    const song = makeSong({ headers: [{ tempo: 100 }, { tempo: 140 }], tracks: [trackOf(0)] });

    // Act
    const file = readMidi(renderMidi(song, { fromHeaderIndex: 1 }).bytes);

    // Assert
    expect(playedNotes(file).map((played) => [played.key, played.start, played.end])).toEqual([[65, 0, 960]]);
    expect(eventsOf(file, 0, 'tempo')).toEqual([{ kind: 'tempo', tick: 0, usq: 428571 }]);
  });

  it('extends a tie into the start measure only from notes that are played', () => {
    // Arrange
    const song = makeSong({
      tracks: [
        {
          measures: [
            [{ notes: [note({ fret: 0, string: 1 })] }],
            [{ notes: [note({ fret: 0, string: 1, isTied: true })] }, { notes: [note({ fret: 2, string: 1 })] }],
          ],
        },
      ],
    });

    // Act / Assert
    expect(sounding(song, { fromHeaderIndex: 1 }).map((played) => [played.key, played.start])).toEqual([[66, 960]]);
  });
});

describe('renderMidi option validation', () => {
  const song = makeSong({ tracks: [trackOf(0)] });

  it.each([
    [{ trackIndexes: [1] }],
    [{ trackIndexes: [-1] }],
    [{ trackIndexes: [0.5] }],
    [{ fromHeaderIndex: 2 }],
    [{ fromHeaderIndex: -1 }],
    [{ fromHeaderIndex: Number.NaN }],
  ])('rejects %j with a RangeError', (options) => {
    // Act / Assert
    expect(() => renderMidi(song, options)).toThrow(RangeError);
  });

  it('renders a song without measures as setup only', () => {
    // Arrange
    const empty: Song = {
      ...song,
      measureHeaders: [],
      tracks: song.tracks.map((track) => ({ ...track, measures: [] })),
    };

    // Act
    const render = renderMidi(empty);

    // Assert
    expect(render.timeline).toEqual([]);
    expect(render.durationSeconds).toBe(0);
    expect(readMidi(render.bytes).tracks).toHaveLength(2);
  });
});

describe('renderMidi repeats', () => {
  it('replays the notes of repeat-close-alternate-endings.gp in TuxGuitar order', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro7', 'repeat-close-alternate-endings.gp'));

    // Act
    const notes = sounding(song);

    // Assert
    expect(notes.map((played) => played.start)).toEqual([0, 960, 1920, 2880, 3840, 4800]);
    expect(new Set(notes.map((played) => played.key))).toEqual(new Set([41]));
  });
});
