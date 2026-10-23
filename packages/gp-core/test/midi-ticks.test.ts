import { describe, expect, it } from 'vitest';
import { MIDI_PPQ, MIDI_TICK, fromMidiTicks, roundToMidiTicks, toMidiTick, truncToMidiTicks } from '../src/midi/midi-ticks';
import { renderMidi } from '../src/midi/render-midi';
import { positionAt } from '../src/midi/timeline';
import { durationTicks } from '../src/model/defaults';
import { type Duration, QUARTER_TIME } from '../src/model/song';
import { readSong } from '../src/read-song';
import { type FixtureFolder, loadFixture } from './helpers/fixtures';
import { type MidiFile, playedNotes, readMidi } from './helpers/midi-reader';
import { duration, makeSong, note } from './helpers/midi-song';

/** Note-on times in seconds (µs precision), from the file's tempo map and division. */
function noteOnMicroseconds(file: MidiFile): number[] {
  const tempos = (file.tracks[0] ?? []).flatMap((event) => (event.kind === 'tempo' ? [event] : []));
  const toMicroseconds = (tick: number): number => {
    let microseconds = 0;
    let lastTick = 0;
    let usq = 500_000;
    for (const tempo of tempos.filter((each) => each.tick <= tick)) {
      microseconds += ((tempo.tick - lastTick) * usq) / file.division;
      lastTick = tempo.tick;
      usq = tempo.usq;
    }
    return Math.round(microseconds + ((tick - lastTick) * usq) / file.division);
  };
  return file.tracks.flatMap((events) => events.flatMap((event) => (event.kind === 'noteOn' && event.velocity > 0 ? [toMicroseconds(event.tick)] : [])));
}

function renderFixture(folder: FixtureFolder, name: string): MidiFile {
  return readMidi(renderMidi(readSong(loadFixture(folder, name))).bytes);
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

describe('MIDI file ticks', () => {
  it('keep a valid Standard MIDI File division that song ticks divide exactly', () => {
    // Assert
    expect(MIDI_PPQ).toBeLessThanOrEqual(0x7fff);
    expect(Number.isInteger(MIDI_TICK)).toBe(true);
    expect(MIDI_TICK * MIDI_PPQ).toBe(QUARTER_TIME);
  });

  it('round a song position to the nearest MIDI file tick', () => {
    // Act / Assert
    expect(toMidiTick(QUARTER_TIME)).toBe(960);
    expect(toMidiTick(QUARTER_TIME / 7)).toBe(137);
    expect(toMidiTick((4 * QUARTER_TIME) / 7)).toBe(549);
  });

  it('cut and round divisions on the MIDI file grid, as TuxGuitar does at 960 PPQ', () => {
    // Act / Assert: a quarter in 96 steps (fade in), and a quarter's stroke delay at a 64th
    expect(truncToMidiTicks(QUARTER_TIME, 96)).toBe(fromMidiTicks(10));
    expect(roundToMidiTicks(QUARTER_TIME * 4, 8 * 64)).toBe(fromMidiTicks(8));
  });
});

describe('renderMidi positions of existing files', () => {
  // Note-on times rendered by gp-editor 0.11.1 (960 ticks per quarter), before ticks became exact for every tuplet.
  it.each([
    ['guitarpro5', 'tuplets.gp5', [0, 333333, 666667, 2000000, 2400000, 2800000, 3200000, 3600000]],
    ['guitarpro7', 'tuplets.gp', [0, 333333, 666667, 2000000, 2400000, 2800000, 3200000, 3600000]],
    ['guitarpro6', 'tuplets.gpx', [0, 333333, 666667, 2000000, 2400000, 2800000, 3200000, 3600000]],
    ['guitarpro5', 'strokes.gp5', [0, 7813, 15625, 23438, 500000, 507813, 515625, 523438, 1000000, 1500000]],
    ['guitarpro4', 'trills.gp4', [0, 125000, 250000, 375000, 500000, 562500, 625000, 687500, 750000, 812500, 875000, 937500, 1000000, 1125000, 1250000, 1375000, 1500000, 1750000]],
    ['guitarpro5', 'grace.gp5', [0, 62500, 375000, 500000]],
  ] as const)('keeps the note-on times of %s/%s', (folder, name, expected) => {
    // Act
    const microseconds = noteOnMicroseconds(renderFixture(folder, name));

    // Assert
    expect(microseconds).toEqual(expected);
  });

  // Count and sum of the note-on times (µs) rendered by gp-editor 0.11.1: any note that moves changes the sum.
  it.each([
    ['guitarpro5', 'serenade.gp5', 2450, 211451632447],
    ['guitarpro7', 'effects.gp', 141, 4119843752],
    ['guitarpro4', 'fade-to-black.gp4', 9089, 2169223158177],
    ['guitarpro5', 'canon.gp5', 10130, 1694256649733],
    ['guitarpro7', 'slash.gp', 20, 57635416],
  ] as const)('keeps every note-on time of %s/%s', (folder, name, count, total) => {
    // Act
    const microseconds = noteOnMicroseconds(renderFixture(folder, name));

    // Assert
    expect(microseconds).toHaveLength(count);
    expect(sum(microseconds)).toBe(total);
  });
});

describe('renderMidi positions of tuplets that do not divide 960', () => {
  const septuplet: Duration = duration(16, { tuplet: { enters: 7, times: 4 } });
  const song = makeSong({
    tracks: [{ measures: [[...Array.from({ length: 7 }, (_, i) => ({ notes: [note({ string: 1, fret: i })], duration: septuplet })), { notes: [note({ string: 2, fret: 0 })] }]] }],
  });

  it('writes a 960 PPQ file whose notes start at each exact position, rounded', () => {
    // Act
    const file = readMidi(renderMidi(song).bytes);

    // Assert
    expect(file.division).toBe(960);
    expect(playedNotes(file).map((played) => played.start)).toEqual([0, 137, 274, 411, 549, 686, 823, 960]);
  });

  it('ends each note at its exact end, rounded, so lengths never drift', () => {
    // Act
    const ends = playedNotes(readMidi(renderMidi(song).bytes)).map((played) => played.end);

    // Assert
    expect(ends).toEqual([137, 274, 411, 549, 686, 823, 960, 1920]);
  });

  it('follows the playback cursor through the tuplet exactly', () => {
    // Arrange
    const { timeline } = renderMidi(song);
    const header = song.measureHeaders[0];
    const fourth = (3 * QUARTER_TIME) / 7;

    // Act: 120 BPM, a quarter lasts half a second
    const position = positionAt(timeline, (3 / 7) * 0.5 + 1e-9);

    // Assert
    expect(durationTicks(septuplet) * 7).toBe(QUARTER_TIME);
    expect(position?.tick).toBe((header?.start ?? 0) + fourth);
  });
});
