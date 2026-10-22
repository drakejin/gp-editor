import {
  INITIAL_PRACTICE,
  type PracticeAction,
  type PracticeSettings,
  practiceReducer,
  resolveLoopRange,
} from '../src/state/practice';

function run(actions: readonly PracticeAction[], from: PracticeSettings = INITIAL_PRACTICE): PracticeSettings {
  return actions.reduce(practiceReducer, from);
}

/** An 8-bar song with the cursor in bar 1. */
const SCOPE = { measureCount: 8, cursorMeasureIndex: 0 };
const LOOPING: PracticeSettings = {
  ...INITIAL_PRACTICE,
  isLooping: true,
  loop: { fromMeasureIndex: 2, toMeasureIndex: 4 },
};

describe('practiceReducer playback tempo', () => {
  it('steps the playback tempo in BPM of the written tempo and resets it to 100%', () => {
    // Act
    const slower = run([{ type: 'shiftTempo', delta: -5, writtenTempo: 100 }]);
    const reset = practiceReducer(slower, { type: 'resetTempo' });

    // Assert
    expect(slower.tempoScale).toBeCloseTo(0.95, 10);
    expect(reset.tempoScale).toBe(1);
  });

  it('returns the same settings when the tempo is already at its bound', () => {
    // Arrange
    const fastest = { ...INITIAL_PRACTICE, tempoScale: 3 };

    // Act / Assert
    expect(practiceReducer(fastest, { type: 'shiftTempo', delta: 5, writtenTempo: 100 })).toBe(fastest);
    expect(practiceReducer(INITIAL_PRACTICE, { type: 'resetTempo' })).toBe(INITIAL_PRACTICE);
  });
});

describe('practiceReducer chosen speed', () => {
  it('sets a percentage of the written tempo (Guitar Pro’s 25%–100% menu)', () => {
    expect(practiceReducer(INITIAL_PRACTICE, { type: 'setTempoScale', scale: 0.8, writtenTempo: 120 }).tempoScale).toBeCloseTo(0.8, 10);
  });

  it('sets a tempo in BPM as the scale of the written tempo', () => {
    expect(practiceReducer(INITIAL_PRACTICE, { type: 'setTempo', tempo: 90, writtenTempo: 120 }).tempoScale).toBeCloseTo(0.75, 10);
  });

  it('keeps a chosen speed inside the playback bounds (25% and at least 20 BPM)', () => {
    // Act
    const tooSlow = practiceReducer(INITIAL_PRACTICE, { type: 'setTempoScale', scale: 0.1, writtenTempo: 60 });
    const tooFast = practiceReducer(INITIAL_PRACTICE, { type: 'setTempo', tempo: 999, writtenTempo: 100 });

    // Assert
    expect(tooSlow.tempoScale).toBeCloseTo(20 / 60, 10);
    expect(tooFast.tempoScale).toBe(3);
  });
});

describe('practiceReducer loop', () => {
  it('loops the cursor bar the first time the loop is turned on', () => {
    // Act
    const looping = run([{ type: 'toggleLoop', measureCount: 8, cursorMeasureIndex: 3 }]);

    // Assert
    expect(looping.isLooping).toBe(true);
    expect(looping.loop).toEqual({ fromMeasureIndex: 3, toMeasureIndex: 3 });
  });

  it('keeps the range when the loop is turned off and on again', () => {
    // Act
    const off = practiceReducer(LOOPING, { type: 'toggleLoop', measureCount: 8, cursorMeasureIndex: 7 });
    const on = practiceReducer(off, { type: 'toggleLoop', measureCount: 8, cursorMeasureIndex: 7 });

    // Assert
    expect(off.isLooping).toBe(false);
    expect(on.loop).toEqual({ fromMeasureIndex: 2, toMeasureIndex: 4 });
  });

  it('moves the end along when the start is set past it, and the start when the end is set before it', () => {
    // Act
    const later = practiceReducer(LOOPING, { type: 'setLoopFrom', measureIndex: 6, ...SCOPE });
    const earlier = practiceReducer(LOOPING, { type: 'setLoopTo', measureIndex: 1, ...SCOPE });

    // Assert
    expect(later.loop).toEqual({ fromMeasureIndex: 6, toMeasureIndex: 6 });
    expect(earlier.loop).toEqual({ fromMeasureIndex: 1, toMeasureIndex: 1 });
  });

  it('sets either end inside the range without moving the other', () => {
    // Act
    const loop = run(
      [
        { type: 'setLoopFrom', measureIndex: 3, ...SCOPE },
        { type: 'setLoopTo', measureIndex: 7, ...SCOPE },
      ],
      LOOPING,
    ).loop;

    // Assert
    expect(loop).toEqual({ fromMeasureIndex: 3, toMeasureIndex: 7 });
  });

  it('clamps the ends to the bars of the song', () => {
    // Act
    const loop = run(
      [
        { type: 'setLoopFrom', measureIndex: -1, ...SCOPE },
        { type: 'setLoopTo', measureIndex: 8, ...SCOPE },
      ],
      LOOPING,
    ).loop;

    // Assert
    expect(loop).toEqual({ fromMeasureIndex: 0, toMeasureIndex: 7 });
  });

  it('keeps the other end at the cursor bar when an end of a loop not set yet changes', () => {
    // Arrange
    const scope = { measureCount: 8, cursorMeasureIndex: 3 };

    // Act
    const earlierStart = practiceReducer(INITIAL_PRACTICE, { type: 'setLoopFrom', measureIndex: 2, ...scope });
    const laterEnd = practiceReducer(INITIAL_PRACTICE, { type: 'setLoopTo', measureIndex: 4, ...scope });
    const earlierEnd = practiceReducer(INITIAL_PRACTICE, { type: 'setLoopTo', measureIndex: 1, ...scope });

    // Assert
    expect(earlierStart.loop).toEqual({ fromMeasureIndex: 2, toMeasureIndex: 3 });
    expect(laterEnd.loop).toEqual({ fromMeasureIndex: 3, toMeasureIndex: 4 });
    expect(earlierEnd.loop).toEqual({ fromMeasureIndex: 1, toMeasureIndex: 1 });
  });
});

describe('resolveLoopRange', () => {
  it('clamps a stored range to a song that lost bars', () => {
    // Act / Assert
    expect(resolveLoopRange({ fromMeasureIndex: 4, toMeasureIndex: 9 }, 6)).toEqual({
      fromMeasureIndex: 4,
      toMeasureIndex: 5,
    });
    expect(resolveLoopRange({ fromMeasureIndex: 7, toMeasureIndex: 9 }, 6)).toEqual({
      fromMeasureIndex: 5,
      toMeasureIndex: 5,
    });
  });

  it('falls back to the given bar when no loop was set', () => {
    // Act / Assert
    expect(resolveLoopRange(undefined, 6, 2)).toEqual({ fromMeasureIndex: 2, toMeasureIndex: 2 });
    expect(resolveLoopRange(undefined, 6)).toEqual({ fromMeasureIndex: 0, toMeasureIndex: 0 });
  });
});

describe('practiceReducer speed trainer', () => {
  it('keeps the BPM step between 0 (off) and 20', () => {
    // Act
    const up = run(Array.from({ length: 25 }, () => ({ type: 'shiftTrainerStep', delta: 1 } as const)));
    const down = run([{ type: 'shiftTrainerStep', delta: -3 }], up);

    // Assert
    expect(up.trainerStep).toBe(20);
    expect(down.trainerStep).toBe(17);
    expect(run([{ type: 'shiftTrainerStep', delta: -1 }]).trainerStep).toBe(0);
  });

  it('starts the top tempo from its default and keeps it within the bar tempo bounds', () => {
    // Arrange: written 100 BPM played at 90 → default top max(100, 90 + 20) = 110.
    const slower = { ...LOOPING, tempoScale: 0.9 };

    // Act
    const raised = practiceReducer(slower, { type: 'shiftTrainerMaxTempo', delta: 5, writtenTempo: 100 });
    const capped = practiceReducer(
      { ...slower, trainerMaxTempo: 298 },
      { type: 'shiftTrainerMaxTempo', delta: 5, writtenTempo: 100 },
    );

    // Assert
    expect(raised.trainerMaxTempo).toBe(115);
    expect(capped.trainerMaxTempo).toBe(300);
  });
});
