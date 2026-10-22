import { renderMidi } from '@gp-editor/core';
import { loopPassAt, nextLoopBatch, passesPerBatch, planPlayback, startSeconds } from '../src/lib/practice-plan';
import { INITIAL_PRACTICE, type PracticeSettings } from '../src/state/practice';
import { beat, header, makeSong, note } from '../test-support/songs';

const BARS = 4;
const song = makeSong(
  Array.from({ length: BARS }, (_, index) => [beat(header(index + 1).start, [note(1, 0)])]),
  Array.from({ length: BARS }, (_, index) => header(index + 1, { tempo: index === 1 ? 100 : 120 })),
);

/** Bars 2–3 looped from 80 BPM (written 100), +10 BPM a pass up to 110. */
const TRAINER: PracticeSettings = {
  tempoScale: 0.8,
  isLooping: true,
  loop: { fromMeasureIndex: 1, toMeasureIndex: 2 },
  trainerStep: 10,
  trainerMaxTempo: 110,
};

describe('planPlayback without loop', () => {
  it('plays the song from the bar at the playback tempo', () => {
    // Act
    const plan = planPlayback(song, { ...INITIAL_PRACTICE, tempoScale: 1.25 }, { measureIndex: 2 });

    // Assert
    expect(plan.options).toEqual({ fromHeaderIndex: 2, passTempoScales: [1.25] });
    expect(plan.startMeasureIndex).toBe(2);
    expect(plan.loop).toBeUndefined();
  });

  it('plays a song without bars as a song even when looping', () => {
    // Arrange
    const empty = { ...song, measureHeaders: [], tracks: [] };

    // Act
    const plan = planPlayback(empty, TRAINER, { measureIndex: 0 });

    // Assert
    expect(plan.options).toEqual({ fromHeaderIndex: 0, passTempoScales: [0.8] });
    expect(plan.loop).toBeUndefined();
  });

  it('clamps the start bar to the song', () => {
    // Act / Assert
    expect(planPlayback(song, INITIAL_PRACTICE, { measureIndex: 9 }).options.fromHeaderIndex).toBe(BARS - 1);
  });
});

describe('planPlayback with loop', () => {
  it('renders the loop range as passes whose tempo rises by the trainer step up to the top tempo', () => {
    // Act
    const plan = planPlayback(song, TRAINER, {});

    // Assert
    expect(plan.options.fromHeaderIndex).toBe(1);
    expect(plan.options.toHeaderIndex).toBe(2);
    expect(plan.loop?.passTempos).toEqual([80, 90, 100, 110, 110, 110, 110, 110]);
    plan.options.passTempoScales?.forEach((scale, index) => {
      expect(scale).toBeCloseTo((plan.loop?.passTempos[index] ?? 0) / 100, 10);
    });
    expect(plan.startMeasureIndex).toBe(1);
  });

  it('starts at a bar inside the loop, or at the loop start for a bar outside it', () => {
    // Act / Assert
    expect(planPlayback(song, TRAINER, { measureIndex: 2 }).startMeasureIndex).toBe(2);
    expect(planPlayback(song, TRAINER, { measureIndex: 3 }).startMeasureIndex).toBe(1);
  });

  it('continues the trainer progression in the next batch', () => {
    // Arrange
    const first = planPlayback(song, { ...TRAINER, trainerMaxTempo: 300 }, {});

    // Act
    const next = planPlayback(song, { ...TRAINER, trainerMaxTempo: 300 }, nextLoopBatch(first));

    // Assert
    expect(next.loop?.firstPassIndex).toBe(8);
    expect(next.loop?.passTempos.slice(0, 2)).toEqual([160, 170]);
    expect(next.startMeasureIndex).toBe(1);
  });

  it('renders as many timeline entries as passes times bars, without a RangeError', () => {
    // Arrange
    const plan = planPlayback(song, TRAINER, {});

    // Act
    const render = renderMidi(song, plan.options);

    // Assert
    expect(render.timeline).toHaveLength(8 * 2);
    expect(render.timeline[2]?.tempo).toBeCloseTo(90, 6);
  });
});

describe('passesPerBatch', () => {
  it('renders 8 passes of a short loop and fewer of a long one, at least one', () => {
    // Act / Assert
    expect(passesPerBatch({ fromMeasureIndex: 0, toMeasureIndex: 3 })).toBe(8);
    expect(passesPerBatch({ fromMeasureIndex: 0, toMeasureIndex: 99 })).toBe(2);
    expect(passesPerBatch({ fromMeasureIndex: 0, toMeasureIndex: 499 })).toBe(1);
  });
});

describe('startSeconds and loopPassAt', () => {
  const plan = planPlayback(song, TRAINER, {});
  const { timeline } = renderMidi(song, plan.options);

  it('finds when a bar first plays in the render, 0 for a bar it does not play', () => {
    // Act / Assert: bar 2 at 80 BPM lasts 3 s.
    expect(startSeconds(timeline, 2)).toBeCloseTo(3, 6);
    expect(startSeconds(timeline, 3)).toBe(0);
  });

  it('tells which pass is playing and its tempo', () => {
    // Act / Assert: pass 1 (80 and 96 BPM) lasts 5.5 s, pass 2 (90 and 108 BPM) 4.89 s.
    expect(loopPassAt(plan, timeline, 1)).toEqual({ passIndex: 0, tempo: 80 });
    expect(loopPassAt(plan, timeline, 7)).toEqual({ passIndex: 1, tempo: 90 });
    expect(loopPassAt(plan, timeline, 10_000)).toBeUndefined();
    expect(loopPassAt(planPlayback(song, INITIAL_PRACTICE, {}), timeline, 1)).toBeUndefined();
  });
});
