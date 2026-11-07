import { describe, expect, it } from 'vitest';
import { NO_TUPLETS, durationTicks } from '../src/model/defaults';
import { QUARTER_TIME } from '../src/model/song';
import { eventsTicks, gapRests, mixedGapRests } from '../src/edit/timeline';
import { dur } from './helpers/edit-songs';

const TRIPLET = dur(8, { tuplet: { enters: 3, times: 2 } });
const QUINTUPLET = dur(16, { tuplet: { enters: 5, times: 4 } });

describe('mixedGapRests: rests for time that only two tuplets together can write', () => {
  it('writes 28/15 of a quarter with a triplet rest and quintuplet rests, which neither tuplet writes alone', () => {
    // Arrange
    const ticks = (QUARTER_TIME * 28) / 15;
    const tuplets = [NO_TUPLETS, TRIPLET, QUINTUPLET];

    // Act
    const rests = mixedGapRests(ticks, tuplets);

    // Assert
    expect(gapRests(ticks, tuplets)).toBeUndefined();
    expect(rests).toBeDefined();
    expect(eventsTicks(rests ?? [])).toBe(ticks);
    expect(rests?.every((event) => event.voice.notes.length === 0)).toBe(true);
  });

  it('answers what gapRests answers when one tuplet writes the time', () => {
    const ticks = durationTicks(QUINTUPLET) * 3;
    expect(mixedGapRests(ticks, [NO_TUPLETS, QUINTUPLET])).toEqual(gapRests(ticks, [NO_TUPLETS, QUINTUPLET]));
  });

  it('answers undefined when no two of the tuplets write the time', () => {
    const ticks = QUARTER_TIME / 105;
    expect(mixedGapRests(ticks, [NO_TUPLETS, TRIPLET, QUINTUPLET, dur(16, { tuplet: { enters: 7, times: 4 } })])).toBeUndefined();
  });
});
