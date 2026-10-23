import { describe, expect, it } from 'vitest';
import { completeMeasureBeats } from '../src/formats/midi/midi-measures';
import type { RawBeat } from '../src/formats/midi/midi-quantize';
import { NORMAL_TUPLET, durationTicks, measureTicks } from '../src/model/defaults';
import type { Duration, NoteValue, Tuplet } from '../src/model/song';
import { fromTux, toTux } from './helpers/ticks';

const BAR = measureTicks(4, 4);
const NOTE = { pitch: 60, velocity: 95, isTied: false };

function duration(value: NoteValue, tuplet: Tuplet = NORMAL_TUPLET): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet };
}

/** [start, length, notes] of each beat, in TuxGuitar ticks. */
function summary(beats: readonly RawBeat[]): [number, number, number][] {
  return beats.map((beat) => [toTux(beat.start), toTux(durationTicks(beat.duration)), beat.notes.length]);
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
    expect(summary(completeMeasureBeats([], fromTux(960), BAR))).toEqual([[960, 3840, 0]]);
  });

  it('lets the last beat last to the bar line when rests cannot fill the time', () => {
    // Arrange: a 64th in a 13:8 tuplet leaves 103/104 of the bar, which the rest filling cannot write.
    const beats: RawBeat[] = [{ start: 0, duration: duration(64, { enters: 13, times: 8 }), notes: [NOTE] }];

    // Act
    const completed = completeMeasureBeats(beats, 0, BAR);

    // Assert
    expect(summary(completed)).toEqual([[0, 3840, 1]]);
  });

  it('removes last beats until the time left can be written', () => {
    // Arrange: after a quarter, a 64th one tick late, which neither rests nor one longer duration can fill up to the bar line.
    const beats: RawBeat[] = [
      { start: 0, duration: duration(4), notes: [NOTE] },
      { start: fromTux(960) + 1, duration: duration(64), notes: [NOTE] },
    ];

    // Act
    const completed = completeMeasureBeats(beats, 0, BAR);

    // Assert
    expect(summary(completed)).toEqual([
      [0, 960, 1],
      [960, 2880, 0],
    ]);
  });
});
