import ReactTestRenderer from 'react-test-renderer';
import { type Playback, usePlayback } from '../src/hooks/use-playback';
import { beat, makeSong, note } from '../test-support/songs';

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderHook(): { current: () => Playback; unmount: () => void } {
  let latest: Playback | undefined;
  function Probe() {
    latest = usePlayback(song, 0);
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
