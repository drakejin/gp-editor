import { describe, expect, it } from 'vitest';
import { positionAt, readSong, renderMidi, type Song } from '../src/index';
import { loadFixture } from './helpers/fixtures';
import { eventsOf, playedNotes, readMidi } from './helpers/midi-reader';
import { type HeaderSpec, makeSong, note } from './helpers/midi-song';

const MEASURE = 3840;

/** One quarter note per bar on string 1: fret 0 in bar 1, fret 1 in bar 2 … so the key tells the bar. */
function countingSong(headers: readonly HeaderSpec[]): Song {
  return makeSong({
    headers,
    tracks: [{ measures: headers.map((_, index) => [{ notes: [note({ fret: index, string: 1 })] }]) }],
  });
}

function starts(song: Song, options: Parameters<typeof renderMidi>[1]): number[][] {
  return playedNotes(readMidi(renderMidi(song, options).bytes)).map((played) => [played.key, played.start]);
}

function tempos(song: Song, options: Parameters<typeof renderMidi>[1]): number[][] {
  return eventsOf(readMidi(renderMidi(song, options).bytes), 0, 'tempo').map((event) => [event.tick, event.usq]);
}

describe('renderMidi toHeaderIndex', () => {
  it('plays only fromHeaderIndex…toHeaderIndex and starts the file at the first of them', () => {
    // Arrange
    const song = countingSong([{}, {}, {}, {}]);

    // Act
    const render = renderMidi(song, { fromHeaderIndex: 1, toHeaderIndex: 2 });

    // Assert
    expect(render.timeline.map((entry) => [entry.headerIndex, entry.seconds])).toEqual([
      [1, 0],
      [2, 2],
    ]);
    expect(starts(song, { fromHeaderIndex: 1, toHeaderIndex: 2 })).toEqual([
      [65, 0],
      [66, MEASURE],
    ]);
    expect(render.durationSeconds).toBe(4);
  });

  it('plays a range in written order, ignoring the repeat signs inside it', () => {
    // Arrange
    const song = countingSong([{ repeatOpen: true }, { repeatClose: 2 }, {}]);

    // Act
    const { timeline } = renderMidi(song, { toHeaderIndex: 2 });

    // Assert
    expect(timeline.map((entry) => entry.headerIndex)).toEqual([0, 1, 2]);
  });

  it('plays the measures of an alternate ending inside a range on every pass', () => {
    // Arrange
    const song = countingSong([
      { repeatOpen: true },
      { repeatAlternative: 1, repeatClose: 1 },
      { repeatAlternative: 2 },
    ]);

    // Act
    const { timeline } = renderMidi(song, { fromHeaderIndex: 1, toHeaderIndex: 2, passTempoScales: [1, 1] });

    // Assert
    expect(timeline.map((entry) => entry.headerIndex)).toEqual([1, 2, 1, 2]);
  });

  it('plays a single measure when toHeaderIndex equals fromHeaderIndex', () => {
    // Arrange
    const song = countingSong([{}, {}, {}]);

    // Act / Assert
    expect(starts(song, { fromHeaderIndex: 2, toHeaderIndex: 2 })).toEqual([[66, 0]]);
  });
});

describe('renderMidi passTempoScales', () => {
  it('plays the range once per pass, each pass right after the previous one', () => {
    // Arrange
    const song = countingSong([{}, {}, {}, {}]);
    const options = { fromHeaderIndex: 1, toHeaderIndex: 2, passTempoScales: [1, 1, 1] };

    // Act
    const render = renderMidi(song, options);

    // Assert
    expect(render.timeline.map((entry) => [entry.passIndex, entry.headerIndex, entry.tick, entry.seconds])).toEqual([
      [0, 1, 4800, 0],
      [0, 2, 8640, 2],
      [1, 1, 4800, 4],
      [1, 2, 8640, 6],
      [2, 1, 4800, 8],
      [2, 2, 8640, 10],
    ]);
    expect(starts(song, options).map(([, start]) => start)).toEqual([0, 1, 2, 3, 4, 5].map((bar) => bar * MEASURE));
    expect(render.durationSeconds).toBe(12);
  });

  it('multiplies every tempo of a pass by its scale, keeping tempo changes in proportion', () => {
    // Arrange
    const song = countingSong([{ tempo: 120 }, { tempo: 60 }]);
    const options = { toHeaderIndex: 1, passTempoScales: [1, 1.5] };

    // Act
    const render = renderMidi(song, options);

    // Assert
    expect(tempos(song, options)).toEqual([
      [0, 500000],
      [MEASURE, 1000000],
      [2 * MEASURE, 333333],
      [3 * MEASURE, 666666],
    ]);
    expect(render.timeline.map((entry) => entry.tempo)).toEqual([120, 60, 180, 90]);
    expect(render.timeline[3]?.seconds).toBeCloseTo(6 + 4 / 3, 5);
    expect(render.durationSeconds).toBeCloseTo(10, 5);
  });

  it('writes no tempo event where the next pass keeps the same tempo', () => {
    // Arrange
    const song = countingSong([{ tempo: 100 }]);

    // Act / Assert
    expect(tempos(song, { passTempoScales: [1.2, 1.2] })).toEqual([[0, 500000]]);
  });

  it('scales the tempo of a single pass without a range (the whole song, repeats expanded)', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'repeat-close.gp5'));

    // Act
    const { timeline, durationSeconds } = renderMidi(song, { passTempoScales: [0.5] });

    // Assert
    expect(timeline.map((entry) => [entry.headerIndex, entry.seconds, entry.tempo])).toEqual([
      [0, 0, 60],
      [1, 4, 60],
      [0, 8, 60],
      [1, 12, 60],
      [2, 16, 60],
    ]);
    expect(durationSeconds).toBe(20);
  });

  it('repeats the whole song with its repeats on every pass', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'repeat-close.gp5'));

    // Act
    const { timeline } = renderMidi(song, { passTempoScales: [1, 2] });

    // Assert
    expect(timeline.map((entry) => entry.headerIndex)).toEqual([0, 1, 0, 1, 2, 0, 1, 0, 1, 2]);
    expect(timeline.map((entry) => entry.passIndex)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(timeline[5]?.seconds).toBe(10);
    expect(timeline[9]?.seconds).toBe(14);
  });

  it('keeps palm-muted notes as long in seconds at a faster pass', () => {
    // Arrange
    const palmMuted = note({ fret: 0, string: 1, effect: { palmMute: true } });
    const song = makeSong({ tracks: [{ measures: [[{ notes: [palmMuted] }]] }] });

    // Act
    const notes = playedNotes(readMidi(renderMidi(song, { passTempoScales: [1, 2] }).bytes));

    // Assert: 60 ticks at 60 BPM → 120 ticks at 120 BPM, 240 ticks at 240 BPM.
    expect(notes.map((played) => (played.end ?? 0) - played.start)).toEqual([120, 240]);
  });

  it('lets the score position follow every pass', () => {
    // Arrange
    const song = countingSong([{}, {}, {}]);
    const { timeline } = renderMidi(song, { fromHeaderIndex: 1, toHeaderIndex: 2, passTempoScales: [1, 2] });

    // Act
    const positions = [0.25, 2.25, 4.125, 5.125].map((seconds) => positionAt(timeline, seconds));

    // Assert: an eighth note into each measure, at 120 BPM in the first pass and 240 BPM in the second.
    expect(positions).toEqual([
      { headerIndex: 1, tick: 4800 + 480 },
      { headerIndex: 2, tick: 8640 + 480 },
      { headerIndex: 1, tick: 4800 + 480 },
      { headerIndex: 2, tick: 8640 + 480 },
    ]);
  });
});
