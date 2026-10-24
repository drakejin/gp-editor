import { renderMidi } from '@gp-editor/core';
import { isSameBeat, metronomeBeatAt } from '../src/lib/metronome-beat';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

/** A 4/4 bar, then a 6/8 bar, at 120 BPM (a quarter is 0.5 s). */
const SONG = makeSong(
  [[beat(960, [note(1, 0)])], [beat(toTux(header(2).start), [note(1, 1)])]],
  [header(1), header(2, { timeSignature: { numerator: 6, denominator: 8 } })],
);

describe('metronomeBeatAt', () => {
  it('counts the beats of the bar being played, compound meters in dotted beats', () => {
    // Arrange
    const { timeline, countInSeconds } = renderMidi(SONG);

    // Act / Assert
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 0.1)).toEqual({ index: 0, count: 4, isCountIn: false });
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 1.6)).toEqual({ index: 3, count: 4, isCountIn: false });
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 2.8)).toEqual({ index: 1, count: 2, isCountIn: false });
  });

  it('counts the count-in bar before the first played bar', () => {
    // Arrange: one 4/4 bar of count-in, 2 s
    const { timeline, countInSeconds } = renderMidi(SONG, { countIn: { velocity: 100 } });

    // Act / Assert
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 0)).toEqual({ index: 0, count: 4, isCountIn: true });
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 1.9)).toEqual({ index: 3, count: 4, isCountIn: true });
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 2.1)).toEqual({ index: 0, count: 4, isCountIn: false });
  });

  it('is undefined before the start, past the end, and without a count-in before the first bar', () => {
    const { timeline, countInSeconds } = renderMidi(SONG);
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, -1)).toBeUndefined();
    expect(metronomeBeatAt(SONG, timeline, countInSeconds, 100)).toBeUndefined();
    expect(metronomeBeatAt(SONG, [], 0, 1)).toBeUndefined();
  });
});

describe('isSameBeat', () => {
  it('compares beats field by field', () => {
    expect(isSameBeat({ index: 1, count: 4, isCountIn: false }, { index: 1, count: 4, isCountIn: false })).toBe(true);
    expect(isSameBeat({ index: 1, count: 4, isCountIn: true }, { index: 1, count: 4, isCountIn: false })).toBe(false);
    expect(isSameBeat(undefined, undefined)).toBe(true);
    expect(isSameBeat(undefined, { index: 0, count: 4, isCountIn: false })).toBe(false);
  });
});
