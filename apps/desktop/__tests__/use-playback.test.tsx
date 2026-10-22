import type { Song } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { type Playback, usePlayback } from '../src/hooks/use-playback';
import { beat, header, makeSong, note } from '../test-support/songs';

const mockPlayer = {
  play: jest.fn<Promise<void>, [string, number?]>(),
  stop: jest.fn(() => Promise.resolve()),
  position: jest.fn(() => Promise.resolve({ seconds: 0.1, isPlaying: true })),
};

jest.mock('../src/native/player', () => ({
  playMidi: (base64: string, from?: number) => mockPlayer.play(base64, from),
  stopMidi: () => mockPlayer.stop(),
  playerPosition: () => mockPlayer.position(),
}));

const song = makeSong([[beat(960, [note(1, 0)])]]);
/** Three bars at 120 BPM: 2 s each. */
const threeBars = makeSong([1, 2, 3].map((number) => [beat(header(number).start, [note(1, 0)])]));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderHook(played: Song = song): { current: () => Playback; unmount: () => void } {
  let latest: Playback | undefined;
  function Probe() {
    latest = usePlayback(played, 0);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return { current: () => latest!, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePlayback', () => {
  it('stays stopped when stop comes before the native player has started', async () => {
    // Arrange
    const pending = deferred();
    mockPlayer.play.mockReturnValueOnce(pending.promise);
    const hook = renderHook();

    // Act: start, stop while play() is still pending, then let play() resolve
    ReactTestRenderer.act(() => hook.current().start(0));
    ReactTestRenderer.act(() => hook.current().stop());
    await ReactTestRenderer.act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Assert
    expect(hook.current().isPlaying).toBe(false);
    expect(mockPlayer.position).not.toHaveBeenCalled();
  });

  it('keeps only the latest start when starts overlap', async () => {
    const first = deferred();
    const second = deferred();
    mockPlayer.play.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().start(0));
    ReactTestRenderer.act(() => hook.current().start(0));
    await ReactTestRenderer.act(async () => {
      second.resolve();
      first.resolve();
      await Promise.all([first.promise, second.promise]);
    });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(40);
    });
    // One poll per interval tick: a leaked second interval would double the calls.
    expect(mockPlayer.position).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('stops the native player when it unmounts', () => {
    mockPlayer.play.mockReturnValueOnce(Promise.resolve());
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().start(0));
    hook.unmount();
    expect(mockPlayer.stop).toHaveBeenCalled();
  });
});

/** Lets pending promises (player calls, polls) settle inside act. */
async function settle(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
}

async function poll(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(40);
  });
  await settle();
}

describe('usePlayback practice', () => {
  it('plays the next batch of passes when a loop batch ends, counting the passes on', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook();
    ReactTestRenderer.act(() =>
      hook.current().changePractice({ type: 'toggleLoop', measureCount: 1, cursorMeasureIndex: 0 }),
    );
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    mockPlayer.position.mockResolvedValueOnce({ seconds: 16, isPlaying: false });

    // Act
    await poll();

    // Assert
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    expect(hook.current().isPlaying).toBe(true);
    expect(hook.current().loopPass).toEqual({ passIndex: 8, tempo: 120 });
    hook.unmount();
  });

  it('stops at the end of the song when not looping', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    mockPlayer.position.mockResolvedValueOnce({ seconds: 2, isPlaying: false });

    // Act
    await poll();

    // Assert
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(hook.current().isPlaying).toBe(false);
  });

  it('restarts a playing loop at the current bar at the new tempo', async () => {
    // Arrange: looping bars 1–3, the player is half-way through bar 2.
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook(threeBars);
    ReactTestRenderer.act(() =>
      hook.current().changePractice({ type: 'toggleLoop', measureCount: 3, cursorMeasureIndex: 0 }),
    );
    ReactTestRenderer.act(() =>
      hook.current().changePractice({ type: 'setLoopTo', measureIndex: 2, measureCount: 3, cursorMeasureIndex: 0 }),
    );
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    mockPlayer.position.mockResolvedValue({ seconds: 3, isPlaying: true });
    await poll();

    // Act: 120 → 150 BPM
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'shiftTempo', delta: 30, writtenTempo: 120 }));
    await settle();

    // Assert: bar 1 at 150 BPM lasts 1.6 s, so bar 2 starts there.
    expect(hook.current().practice.tempoScale).toBe(1.25);
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    expect(mockPlayer.play.mock.calls[0]?.[1]).toBe(0);
    expect(mockPlayer.play.mock.calls[1]?.[1]).toBeCloseTo(1.6, 6);
    hook.unmount();
  });

  it('shows the error and stops when the player cannot play', async () => {
    // Arrange
    mockPlayer.play.mockRejectedValueOnce(new Error('No sound bank'));
    const hook = renderHook();

    // Act
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();

    // Assert
    expect(hook.current().isPlaying).toBe(false);
    expect(hook.current().error).toBe('No sound bank');
  });

  it('reports a render that fails and silences the player', () => {
    // Arrange: a loop on a bar written at 0 BPM cannot be scaled.
    const hook = renderHook(makeSong([[beat(960, [note(1, 0)])]], [header(1, { tempo: 0 })]));
    ReactTestRenderer.act(() =>
      hook.current().changePractice({ type: 'toggleLoop', measureCount: 1, cursorMeasureIndex: 0 }),
    );

    // Act
    ReactTestRenderer.act(() => hook.current().start(0));

    // Assert
    expect(hook.current().isPlaying).toBe(false);
    expect(hook.current().error).toMatch(/passTempoScales/);
    expect(mockPlayer.stop).toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('only stores the settings when they change while stopped', () => {
    // Arrange
    const hook = renderHook();

    // Act
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'shiftTrainerStep', delta: 5 }));

    // Assert
    expect(hook.current().practice.trainerStep).toBe(5);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});
