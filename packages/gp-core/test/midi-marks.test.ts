import { describe, expect, it } from 'vitest';
import { measureTicks } from '../src/model/defaults';
import { renderMidi, type Song } from '../src/index';
import { eventsOf, type MidiFile, playedNotes, readMidi } from './helpers/midi-reader';
import { type BeatSpec, duration, makeSong, note, type TrackSpec } from './helpers/midi-song';

const BAR = measureTicks(4, 4);
const SUSTAIN = 64;
const EXPRESSION = 11;

function midi(song: Song, options: Parameters<typeof renderMidi>[1] = {}): MidiFile {
  return readMidi(renderMidi(song, options).bytes);
}

function songOf(measures: readonly (readonly BeatSpec[])[], track: Partial<TrackSpec> = {}): Song {
  return makeSong({ tracks: [{ measures, ...track }] });
}

/** [tick, value] of a controller on MIDI channel 0 of track 1, after the channel setup at tick 0. */
function controller(file: MidiFile, number: number): number[][] {
  return eventsOf(file, 1, 'controlChange')
    .filter((event) => event.controller === number && event.channel === 0)
    .map((event) => [event.tick, event.value]);
}

const quarter = (velocity: number, extra: Partial<BeatSpec> = {}): BeatSpec => ({ notes: [note({ fret: 0, string: 1, velocity })], ...extra });

describe('renderMidi fade out and volume swell', () => {
  it('lowers the expression from 127 to 31 over a fade-out note, then restores it', () => {
    // Arrange
    const song = songOf([[{ notes: [note({ fret: 0, string: 1, effect: { fadeOut: true } })], duration: duration(1) }]]);

    // Act
    const ramp = controller(midi(song), EXPRESSION).slice(1);

    // Assert: one step every 3840 / 96 = 40 ticks.
    expect(ramp.slice(0, 3)).toEqual([
      [0, 127],
      [40, 126],
      [80, 125],
    ]);
    expect(ramp.at(-2)).toEqual([3800, 32]);
    expect(ramp.at(-1)).toEqual([3840, 127]);
  });

  it('swells the expression up to 127 over the first half of the note and down over the second', () => {
    // Arrange
    const song = songOf([[{ notes: [note({ fret: 0, string: 1, effect: { volumeSwell: true } })], duration: duration(1) }]]);

    // Act
    const ramp = controller(midi(song), EXPRESSION).slice(1);

    // Assert: 96 steps up in 1920 ticks (20 apart), 96 down.
    expect(ramp.slice(0, 2)).toEqual([
      [0, 31],
      [20, 32],
    ]);
    expect(ramp.find(([tick]) => tick === 1920)).toEqual([1920, 127]);
    expect(ramp.at(-2)).toEqual([3820, 32]);
    expect(ramp.at(-1)).toEqual([3840, 127]);
  });
});

describe('renderMidi hairpins', () => {
  it('ramps a crescendo from the dynamic at its start to the louder dynamic after it', () => {
    // Arrange
    const song = songOf([[quarter(47, { hairpin: 'crescendo' }), quarter(47, { hairpin: 'crescendo' }), quarter(47, { hairpin: 'crescendo' }), quarter(47, { hairpin: 'crescendo' })], [quarter(95)]]);

    // Act / Assert
    expect(playedNotes(midi(song)).map((played) => played.velocity)).toEqual([47, 59, 71, 83, 95]);
  });

  it('ramps a decrescendo one dynamic down when no softer dynamic follows', () => {
    // Arrange
    const song = songOf([[quarter(79, { hairpin: 'decrescendo' }), quarter(79, { hairpin: 'decrescendo' }), quarter(79, { hairpin: 'decrescendo' }), quarter(79, { hairpin: 'decrescendo' })], [quarter(79)]]);

    // Act / Assert
    expect(playedNotes(midi(song)).map((played) => played.velocity)).toEqual([79, 75, 71, 67, 79]);
  });

  it('ramps a crescendo that ends the song one dynamic up, to the end of its last beat', () => {
    // Arrange
    const song = songOf([[quarter(63, { hairpin: 'crescendo' }), quarter(63, { hairpin: 'crescendo' })]]);

    // Act / Assert: mp to mf (79) over two quarters.
    expect(playedNotes(midi(song)).map((played) => played.velocity)).toEqual([63, 71]);
  });

  it('ramps a crescendo one dynamic up when only rests follow it', () => {
    // Arrange
    const rest: BeatSpec = { isEmpty: false, notes: [] };
    const song = songOf([[quarter(63, { hairpin: 'crescendo' }), quarter(63, { hairpin: 'crescendo' }), rest, rest]]);

    // Act / Assert: mp to mf (79) over two quarters, up to the rest after the run.
    expect(playedNotes(midi(song)).map((played) => played.velocity)).toEqual([63, 71]);
  });

  it('ramps across a bar line, and keeps accents on top of the ramp', () => {
    // Arrange
    const accented = { notes: [note({ fret: 0, string: 1, velocity: 47, effect: { accentuatedNote: true } })], hairpin: 'crescendo' as const };
    const song = songOf([[{ isEmpty: false, notes: [] }, { isEmpty: false, notes: [] }, quarter(47, { hairpin: 'crescendo' }), quarter(47, { hairpin: 'crescendo' })], [accented, quarter(47, { hairpin: 'crescendo' }), quarter(111)]]);

    // Act / Assert
    expect(playedNotes(midi(song)).map((played) => played.velocity)).toEqual([47, 63, 79 + 16, 95, 111]);
  });
});

describe('renderMidi rasgueado', () => {
  const chord = [note({ fret: 0, string: 1 }), note({ fret: 0, string: 2 })];

  it('strums each finger of a pattern as its own stroke from the lowest string, evenly over the beat', () => {
    // Arrange
    const song = songOf([[{ notes: chord, rasgueado: 'mi' }]]);

    // Act
    const notes = playedNotes(midi(song)).map((played) => [played.key, played.start, played.end]);

    // Assert: strokes at 0 and 480; within a stroke the strings 60 ticks apart, the lower first.
    expect(notes).toEqual([
      [59, 0, 480],
      [64, 60, 480],
      [59, 480, 960],
      [64, 540, 960],
    ]);
  });

  it('plays an anapaest short, short, long', () => {
    const song = songOf([[{ notes: [note({ fret: 0, string: 1 })], rasgueado: 'miiAnapaest' }]]);
    expect(playedNotes(midi(song)).map((played) => [played.start, played.end])).toEqual([
      [0, 240],
      [240, 480],
      [480, 960],
    ]);
  });

  it('spreads the strokes of a long beat over a quarter note and lets the last one ring', () => {
    const song = songOf([[{ notes: [note({ fret: 0, string: 1 })], rasgueado: 'ppp', duration: duration(2) }]]);
    expect(playedNotes(midi(song)).map((played) => [played.start, played.end])).toEqual([
      [0, 320],
      [320, 640],
      [640, 1920],
    ]);
  });
});

describe('renderMidi sustain pedal', () => {
  it('presses and releases the sustain pedal where the marks are, in every played pass', () => {
    // Arrange
    const pedals = [[{ offset: 0, action: 'down' as const }, { offset: BAR / 2, action: 'up' as const }, { offset: BAR / 2, action: 'down' as const }], [{ offset: BAR, action: 'up' as const }]];
    const song = makeSong({ headers: [{ repeatOpen: true }, { repeatClose: 1 }], tracks: [{ measures: [[quarter(95)], [quarter(95)]], pedals }] });

    // Act / Assert
    expect(controller(midi(song), SUSTAIN)).toEqual([
      [0, 127],
      [1920, 0],
      [1920, 127],
      [7680, 0],
      [7680, 127],
      [9600, 0],
      [9600, 127],
      [15360, 0],
    ]);
  });

  it('starts with the pedal down when playback starts after a press', () => {
    // Arrange
    const song = songOf([[quarter(95)], [quarter(95)], [quarter(95)]], { pedals: [[{ offset: 0, action: 'down' }], undefined, [{ offset: 0, action: 'up' }]] });

    // Act / Assert
    expect(controller(midi(song, { fromHeaderIndex: 1 }), SUSTAIN)).toEqual([
      [0, 127],
      [3840, 0],
    ]);
  });

  it('sends no sustain pedal for a track without pedal marks', () => {
    expect(controller(midi(songOf([[quarter(95)]])), SUSTAIN)).toEqual([]);
  });
});
