import { describe, expect, it } from 'vitest';
import { CLICK_KEYS, meterBeats, renderMidi, type Song } from '../src/index';
import { QUARTER_TIME } from '../src/model/song';
import { eventsOf, type MidiFile, playedNotes, readMidi } from './helpers/midi-reader';
import { type HeaderSpec, makeSong, note } from './helpers/midi-song';

/** MIDI file ticks per quarter note. */
const QUARTER = 960;
const VELOCITY = 100;

/** One quarter note per bar on string 1, fret = bar index. */
function countingSong(headers: readonly HeaderSpec[]): Song {
  return makeSong({
    headers,
    tracks: [{ measures: headers.map((_, index) => [{ notes: [note({ fret: index, string: 1 })] }]) }],
  });
}

function clicksOf(file: MidiFile, track: number): number[][] {
  return playedNotes(file)
    .filter((played) => played.track === track)
    .map((played) => [played.start, played.key, played.channel]);
}

describe('meterBeats', () => {
  it('counts simple meters in their beat value', () => {
    expect(meterBeats({ numerator: 4, denominator: 4 })).toEqual({ count: 4, beatTicks: QUARTER_TIME });
    expect(meterBeats({ numerator: 2, denominator: 2 })).toEqual({ count: 2, beatTicks: QUARTER_TIME * 2 });
    expect(meterBeats({ numerator: 3, denominator: 8 })).toEqual({ count: 3, beatTicks: QUARTER_TIME / 2 });
    expect(meterBeats({ numerator: 7, denominator: 8 })).toEqual({ count: 7, beatTicks: QUARTER_TIME / 2 });
  });

  it('counts compound meters (6/8, 9/8, 12/8, 6/16) in dotted beats', () => {
    expect(meterBeats({ numerator: 6, denominator: 8 })).toEqual({ count: 2, beatTicks: (QUARTER_TIME * 3) / 2 });
    expect(meterBeats({ numerator: 9, denominator: 8 })).toEqual({ count: 3, beatTicks: (QUARTER_TIME * 3) / 2 });
    expect(meterBeats({ numerator: 12, denominator: 8 })).toEqual({ count: 4, beatTicks: (QUARTER_TIME * 3) / 2 });
    expect(meterBeats({ numerator: 6, denominator: 16 })).toEqual({ count: 2, beatTicks: (QUARTER_TIME * 3) / 4 });
    expect(meterBeats({ numerator: 6, denominator: 4 })).toEqual({ count: 6, beatTicks: QUARTER_TIME });
  });
});

describe('renderMidi metronome', () => {
  it('adds a track after the song tracks that clicks every beat on the percussion channel, the first beat accented', () => {
    // Arrange
    const song = countingSong([{}, { numerator: 6, denominator: 8 }]);

    // Act
    const render = renderMidi(song, { metronome: { velocity: VELOCITY } });
    const file = readMidi(render.bytes);

    // Assert
    expect(render.metronomeTrackIndex).toBe(2);
    expect(file.tracks).toHaveLength(3);
    expect(clicksOf(file, 2)).toEqual([
      [0, CLICK_KEYS.accent, 9],
      [QUARTER, CLICK_KEYS.beat, 9],
      [QUARTER * 2, CLICK_KEYS.beat, 9],
      [QUARTER * 3, CLICK_KEYS.beat, 9],
      [QUARTER * 4, CLICK_KEYS.accent, 9],
      [QUARTER * 5.5, CLICK_KEYS.beat, 9],
    ]);
    expect(eventsOf(file, 2, 'trackName')).toEqual([{ kind: 'trackName', tick: 0, name: 'Metronome' }]);
  });

  it('plays the accent at the velocity asked for and the other beats softer', () => {
    // Arrange
    const song = countingSong([{}]);

    // Act
    const clicks = playedNotes(readMidi(renderMidi(song, { metronome: { velocity: VELOCITY } }).bytes)).filter((played) => played.track === 2);

    // Assert
    expect(clicks.map((played) => played.velocity)).toEqual([VELOCITY, 80, 80, 80]);
  });

  it('follows repeats and loop passes, and leaves the song unchanged', () => {
    // Arrange: two bars played twice
    const song = countingSong([{ repeatOpen: true }, { repeatClose: 1 }]);
    const plain = renderMidi(song);

    // Act
    const repeated = readMidi(renderMidi(song, { metronome: { velocity: VELOCITY } }).bytes);
    const looped = readMidi(renderMidi(song, { metronome: { velocity: VELOCITY }, toHeaderIndex: 0, passTempoScales: [1, 0.5] }).bytes);

    // Assert
    expect(clicksOf(repeated, 2)).toHaveLength(16);
    expect(clicksOf(looped, 2).map(([start]) => start)).toEqual([0, 960, 1920, 2880, 3840, 4800, 5760, 6720]);
    expect(playedNotes(repeated).filter((played) => played.track !== 2)).toEqual(playedNotes(readMidi(plain.bytes)));
    expect(renderMidi(song).metronomeTrackIndex).toBeUndefined();
  });

  it('refuses a velocity outside 1…127', () => {
    const song = countingSong([{}]);
    expect(() => renderMidi(song, { metronome: { velocity: 0 } })).toThrow(RangeError);
    expect(() => renderMidi(song, { metronome: { velocity: 128 } })).toThrow(RangeError);
    expect(() => renderMidi(song, { countIn: { velocity: 1.5 } })).toThrow(RangeError);
  });
});

describe('renderMidi count-in', () => {
  it('puts one bar of clicks in the first played bar’s meter and tempo before it, and starts the timeline after it', () => {
    // Arrange: 3/4 at 120 BPM, then 4/4 at 60
    const song = countingSong([{ numerator: 3, tempo: 120 }, { tempo: 60 }]);

    // Act
    const render = renderMidi(song, { countIn: { velocity: VELOCITY } });
    const file = readMidi(render.bytes);

    // Assert: three quarter clicks (1.5 s at 120 BPM), then the song a bar later
    expect(render.countInSeconds).toBe(1.5);
    expect(render.timeline.map((entry) => [entry.headerIndex, entry.seconds])).toEqual([[0, 1.5], [1, 3]]);
    expect(render.durationSeconds).toBe(7);
    expect(clicksOf(file, 2)).toEqual([
      [0, CLICK_KEYS.accent, 9],
      [QUARTER, CLICK_KEYS.beat, 9],
      [QUARTER * 2, CLICK_KEYS.beat, 9],
    ]);
    expect(playedNotes(file).filter((played) => played.track === 1).map((played) => played.start)).toEqual([QUARTER * 3, QUARTER * 6]);
    expect(eventsOf(file, 0, 'tempo')).toEqual([
      { kind: 'tempo', tick: 0, usq: 500000 },
      { kind: 'tempo', tick: QUARTER * 6, usq: 1000000 },
    ]);
    expect(eventsOf(file, 0, 'timeSignature').map((event) => [event.tick, event.numerator])).toEqual([[0, 3], [QUARTER * 6, 4]]);
  });

  it('counts in at the first pass’s speed, from the bar playback starts at', () => {
    // Arrange
    const song = countingSong([{ tempo: 120 }, { tempo: 60 }]);

    // Act
    const render = renderMidi(song, { fromHeaderIndex: 1, countIn: { velocity: VELOCITY }, passTempoScales: [0.5] });

    // Assert: a 4/4 bar at 30 BPM
    expect(render.countInSeconds).toBe(8);
    expect(eventsOf(readMidi(render.bytes), 0, 'tempo')).toEqual([{ kind: 'tempo', tick: 0, usq: 2_000_000 }]);
  });

  it('keeps its own track after the metronome’s, so muting the metronome leaves it sounding', () => {
    // Arrange
    const song = countingSong([{}]);

    // Act
    const render = renderMidi(song, { metronome: { velocity: VELOCITY }, countIn: { velocity: VELOCITY } });
    const file = readMidi(render.bytes);

    // Assert
    expect(render.metronomeTrackIndex).toBe(2);
    expect(render.countInTrackIndex).toBe(3);
    expect(clicksOf(file, 2).map(([start]) => start)).toEqual([3840, 4800, 5760, 6720]);
    expect(clicksOf(file, 3).map(([start]) => start)).toEqual([0, 960, 1920, 2880]);
    expect(eventsOf(file, 3, 'trackName')).toEqual([{ kind: 'trackName', tick: 0, name: 'Count-in' }]);
  });

  it('has no count-in without the option', () => {
    expect(renderMidi(countingSong([{}])).countInSeconds).toBe(0);
    expect(renderMidi(countingSong([{}])).countInTrackIndex).toBeUndefined();
  });

  it('puts the count-in right after the song tracks without a metronome', () => {
    expect(renderMidi(countingSong([{}]), { countIn: { velocity: VELOCITY } }).countInTrackIndex).toBe(2);
  });
});

describe('renderMidi fixedTempo', () => {
  it('plays every bar at one tempo, ignoring the song’s tempo changes', () => {
    // Arrange
    const song = countingSong([{ tempo: 120 }, { tempo: 60 }, { tempo: 200 }]);

    // Act
    const render = renderMidi(song, { fixedTempo: 92.5 });

    // Assert
    expect(eventsOf(readMidi(render.bytes), 0, 'tempo')).toEqual([{ kind: 'tempo', tick: 0, usq: 648648 }]);
    expect(render.timeline.map((entry) => entry.tempo)).toEqual([92.5, 92.5, 92.5]);
  });

  it('still applies each pass’s tempo scale', () => {
    // Arrange
    const song = countingSong([{ tempo: 120 }, { tempo: 60 }]);

    // Act
    const render = renderMidi(song, { fixedTempo: 100, passTempoScales: [0.5] });

    // Assert
    expect(render.timeline.map((entry) => entry.tempo)).toEqual([50, 50]);
  });

  it('refuses a tempo that is not a positive number', () => {
    const song = countingSong([{}]);
    expect(() => renderMidi(song, { fixedTempo: 0 })).toThrow(RangeError);
    expect(() => renderMidi(song, { fixedTempo: Number.NaN })).toThrow(RangeError);
  });
});
