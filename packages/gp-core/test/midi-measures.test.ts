import { describe, expect, it } from 'vitest';
import { completeMeasureBeats } from '../src/formats/midi/midi-measures';
import type { RawBeat } from '../src/formats/midi/midi-quantize';
import { NORMAL_TUPLET, durationTicks } from '../src/model/defaults';
import type { Duration, NoteValue } from '../src/model/song';

const BAR = 3840;
const NOTE = { pitch: 60, velocity: 95, isTied: false };

function duration(value: NoteValue, tuplet = NORMAL_TUPLET): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet };
}

function summary(beats: readonly RawBeat[]): [number, number, number][] {
  return beats.map((beat) => [beat.start, durationTicks(beat.duration), beat.notes.length]);
}

describe('completeMeasureBeats (SongAdjuster)', () => {
  it('fills the rest of the measure with rests', () => {
    // Arrange
    const beats: RawBeat[] = [{ start: 0, duration: duration(4), notes: [NOTE] }];

    // Act
    const completed = completeMeasureBeats(beats, 0, BAR);

    // Assert
    expect(summary(completed)).toEqual([
      [0, 960, 1],
      [960, 2880, 0],
    ]);
  });

  it('fills an empty measure with one rest', () => {
    // Assert
    expect(summary(completeMeasureBeats([], 960, BAR))).toEqual([[960, 3840, 0]]);
  });

  it('lets the last beat last to the bar line when rests cannot fill the time', () => {
    // Arrange: a 64th in a 7:4 tuplet leaves 3806 ticks no rests can write.
    const beats: RawBeat[] = [{ start: 0, duration: duration(64, { enters: 7, times: 4 }), notes: [NOTE] }];

    // Act
    const completed = completeMeasureBeats(beats, 0, BAR);

    // Assert
    expect(summary(completed)).toEqual([[0, 3840, 1]]);
  });

  it('removes last beats until the time left can be written', () => {
    // Arrange: after a quarter, two 7:4 64ths that no single duration can stretch to the bar line.
    const sliver = duration(64, { enters: 7, times: 4 });
    const beats: RawBeat[] = [
      { start: 0, duration: duration(4), notes: [NOTE] },
      { start: 960, duration: sliver, notes: [NOTE] },
      { start: 994, duration: sliver, notes: [NOTE] },
    ];

    // Act
    const completed = completeMeasureBeats(beats, 0, BAR);

    // Assert
    expect(completed.reduce((end, beat) => Math.max(end, beat.start + durationTicks(beat.duration)), 0)).toBe(BAR);
    expect(completed.length).toBeLessThan(beats.length + 1);
    expect(completed[0]).toEqual(beats[0]);
  });
});
