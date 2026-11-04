import { AUTOSAVE_IDLE_MS, AUTOSAVE_INTERVAL_MS, AUTOSAVE_MAX_DELAY_MS, nextAutosaveStep } from '../src/autosave/autosave-schedule';

describe('nextAutosaveStep: a due autosave waits for a pause in the editing', () => {
  it('saves every 30 s, waiting at most 30 s more for a pause of 1.5 s', () => {
    expect(AUTOSAVE_INTERVAL_MS).toBe(30_000);
    expect(AUTOSAVE_IDLE_MS).toBe(1_500);
    expect(AUTOSAVE_MAX_DELAY_MS).toBe(30_000);
  });

  it('writes at once when nothing was done for the idle time', () => {
    expect(nextAutosaveStep({ now: 10_000, dueSince: 9_000, lastActivityAt: 8_000, isPlaying: false })).toEqual({ kind: 'write' });
  });

  it('waits for the rest of the pause while the user is editing', () => {
    expect(nextAutosaveStep({ now: 10_000, dueSince: 9_000, lastActivityAt: 9_600, isPlaying: false })).toEqual({ kind: 'wait', ms: 1_100 });
  });

  it('waits while playback plays', () => {
    expect(nextAutosaveStep({ now: 10_000, dueSince: 9_000, lastActivityAt: 0, isPlaying: true })).toEqual({ kind: 'wait', ms: AUTOSAVE_IDLE_MS });
  });

  it('never waits past the longest delay: then it writes, editing or playing', () => {
    const late = { now: 10_000 + AUTOSAVE_MAX_DELAY_MS, dueSince: 10_000 };
    expect(nextAutosaveStep({ ...late, lastActivityAt: late.now, isPlaying: true })).toEqual({ kind: 'write' });
    expect(nextAutosaveStep({ now: 39_500, dueSince: 10_000, lastActivityAt: 39_400, isPlaying: false })).toEqual({ kind: 'wait', ms: 500 });
  });
});
