import {
  INITIAL_PRACTICE,
  type PracticeAction,
  type PracticeSettings,
  needsNewRender,
  playbackStartTempo,
  practiceReducer,
  resolveLoopRange,
  typedTempoAction,
} from '../src/state/practice';
import { beat, header, makeSong } from '../test-support/songs';

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

describe('practiceReducer metronome, count-in and hover preview', () => {
  it('turns the metronome, the count-in and the hover preview on and off, all off at first', () => {
    // Act
    const on = run([{ type: 'toggleMetronome' }, { type: 'toggleCountIn' }, { type: 'togglePreviewOnHover' }]);
    const off = run([{ type: 'toggleMetronome' }, { type: 'toggleCountIn' }, { type: 'togglePreviewOnHover' }], on);

    // Assert
    expect([INITIAL_PRACTICE.isMetronomeOn, INITIAL_PRACTICE.isCountInOn, INITIAL_PRACTICE.isPreviewOnHover]).toEqual([false, false, false]);
    expect([on.isMetronomeOn, on.isCountInOn, on.isPreviewOnHover]).toEqual([true, true, true]);
    expect([off.isMetronomeOn, off.isCountInOn, off.isPreviewOnHover]).toEqual([false, false, false]);
  });

  it('steps the metronome volume by 10% between 10% and 100%', () => {
    // Act
    const softer = run([{ type: 'shiftMetronomeVolume', delta: -10 }, { type: 'shiftMetronomeVolume', delta: -10 }]);
    const softest = run(Array.from({ length: 12 }, () => ({ type: 'shiftMetronomeVolume', delta: -10 } as const)));

    // Assert
    expect(INITIAL_PRACTICE.metronomeVolume).toBe(80);
    expect(softer.metronomeVolume).toBe(60);
    expect(softest.metronomeVolume).toBe(10);
    expect(practiceReducer({ ...INITIAL_PRACTICE, metronomeVolume: 100 }, { type: 'shiftMetronomeVolume', delta: 10 }).metronomeVolume).toBe(100);
  });
});

describe('practiceReducer relative speed', () => {
  it('steps the speed by 5% of the written tempo, from 25% to 200%', () => {
    // Act
    const faster = run([{ type: 'shiftSpeed', delta: 5, writtenTempo: 120 }]);
    const slowest = run(Array.from({ length: 30 }, () => ({ type: 'shiftSpeed', delta: -5, writtenTempo: 120 } as const)));
    const fastest = run(Array.from({ length: 30 }, () => ({ type: 'shiftSpeed', delta: 5, writtenTempo: 120 } as const)));

    // Assert
    expect(faster.tempoScale).toBeCloseTo(1.05, 10);
    expect(slowest.tempoScale).toBeCloseTo(0.25, 10);
    expect(fastest.tempoScale).toBeCloseTo(2, 10);
  });

  it('lands on the 5% grid from a speed between steps, and never moves the other way past 200%', () => {
    // Arrange: 83% (from BPM steps) and 250%
    const between = { ...INITIAL_PRACTICE, tempoScale: 0.83 };
    const beyond = { ...INITIAL_PRACTICE, tempoScale: 2.5 };

    // Act / Assert
    expect(practiceReducer(between, { type: 'shiftSpeed', delta: 5, writtenTempo: 120 }).tempoScale).toBeCloseTo(0.85, 10);
    expect(practiceReducer(between, { type: 'shiftSpeed', delta: -5, writtenTempo: 120 }).tempoScale).toBeCloseTo(0.8, 10);
    expect(practiceReducer(beyond, { type: 'shiftSpeed', delta: 5, writtenTempo: 120 })).toBe(beyond);
  });
});

describe('practiceReducer tempo lock', () => {
  it('locks the tempo at the start bar’s written tempo, and unlocks it', () => {
    // Act
    const locked = run([{ type: 'toggleTempoLock', writtenTempo: 92.5 }]);
    const unlocked = practiceReducer(locked, { type: 'toggleTempoLock', writtenTempo: 120 });

    // Assert
    expect(INITIAL_PRACTICE.lockedTempo).toBeUndefined();
    expect(locked.lockedTempo).toBe(92.5);
    expect(unlocked.lockedTempo).toBeUndefined();
  });

  it('sets the locked tempo to two decimals within 1–999, and ignores what is not a tempo', () => {
    // Arrange
    const locked = run([{ type: 'toggleTempoLock', writtenTempo: 120 }]);

    // Act / Assert
    expect(practiceReducer(locked, { type: 'setLockedTempo', tempo: 92.456 }).lockedTempo).toBe(92.46);
    expect(practiceReducer(locked, { type: 'setLockedTempo', tempo: 5000 }).lockedTempo).toBe(999);
    expect(practiceReducer(locked, { type: 'setLockedTempo', tempo: Number.NaN })).toBe(locked);
    expect(practiceReducer(INITIAL_PRACTICE, { type: 'setLockedTempo', tempo: 90 }).lockedTempo).toBe(90);
  });

  it('starts playback from the locked tempo instead of the written one', () => {
    // Arrange
    const song = makeSong([[beat(960, [])]], [header(1, { tempo: 120 })]);

    // Act / Assert
    expect(playbackStartTempo(song, { ...INITIAL_PRACTICE, lockedTempo: 75.5 }, 0)).toBe(75.5);
    expect(playbackStartTempo(song, INITIAL_PRACTICE, 0)).toBe(120);
  });
});

describe('typedTempoAction', () => {
  it('sets the playback tempo, or the locked tempo while the tempo is locked', () => {
    expect(typedTempoAction(INITIAL_PRACTICE, 92.5, 120)).toEqual({ type: 'setTempo', tempo: 92.5, writtenTempo: 120 });
    expect(typedTempoAction({ ...INITIAL_PRACTICE, lockedTempo: 100 }, 92.5, 100)).toEqual({ type: 'setLockedTempo', tempo: 92.5 });
  });
});

describe('needsNewRender', () => {
  it('re-renders for what the MIDI file holds, not for the metronome toggle, count-in or hover preview', () => {
    // Act / Assert
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, isMetronomeOn: true })).toBe(false);
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, isCountInOn: true })).toBe(false);
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, isPreviewOnHover: true })).toBe(false);
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, metronomeVolume: 50 })).toBe(true);
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, lockedTempo: 90 })).toBe(true);
    expect(needsNewRender(INITIAL_PRACTICE, { ...INITIAL_PRACTICE, tempoScale: 0.5 })).toBe(true);
  });
});
