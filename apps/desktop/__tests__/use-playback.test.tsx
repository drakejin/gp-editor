import type { Song } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { type Playback, usePlayback } from '../src/hooks/use-playback';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const mockPlayer = {
  play: jest.fn<Promise<void>, [string, number?]>(),
  stop: jest.fn(() => Promise.resolve()),
  position: jest.fn(() => Promise.resolve({ seconds: 0.1, isPlaying: true })),
  setProgram: jest.fn((_channel: number, _program: number) => Promise.resolve()),
  setController: jest.fn((_channel: number, _controller: number, _value: number) => Promise.resolve()),
  setMutedTracks: jest.fn((_trackIndexes: readonly number[]) => Promise.resolve()),
};

jest.mock('../src/native/player', () => ({
  playMidi: (base64: string, from?: number) => mockPlayer.play(base64, from),
  stopMidi: () => mockPlayer.stop(),
  playerPosition: () => mockPlayer.position(),
  setMidiProgram: (channel: number, program: number) => mockPlayer.setProgram(channel, program),
  setMidiController: (channel: number, controller: number, value: number) => mockPlayer.setController(channel, controller, value),
  setMutedTracks: (trackIndexes: readonly number[]) => mockPlayer.setMutedTracks(trackIndexes),
}));

const song = makeSong([[beat(960, [note(1, 0)])]]);
/** Three bars at 120 BPM: 2 s each. */
const threeBars = makeSong([1, 2, 3].map((number) => [beat(toTux(header(number).start), [note(1, 0)])]));

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

describe('usePlayback metronome and count-in', () => {
  it('mutes the metronome’s track before playing while the metronome is off, and unmutes it live without a restart', async () => {
    // Arrange: one track, so the metronome is the file's third track (after the conductor)
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();

    // Act
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'toggleMetronome' }));
    await settle();

    // Assert
    expect(mockPlayer.setMutedTracks.mock.calls).toEqual([[[2]], [[]]]);
    expect(mockPlayer.setMutedTracks.mock.invocationCallOrder[0]).toBeLessThan(mockPlayer.play.mock.invocationCallOrder[0] ?? 0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('restarts for a new metronome volume, which the render holds', async () => {
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook();
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'shiftMetronomeVolume', delta: -10 }));
    await settle();
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('counts in from 0 s when playback starts, showing the count-in beats, but not when it restarts', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook(threeBars);
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'toggleCountIn' }));

    // Act: 0.6 s into the count-in (a beat is 0.5 s at 120 BPM)
    ReactTestRenderer.act(() => hook.current().start(1));
    await settle();
    mockPlayer.position.mockResolvedValue({ seconds: 0.6, isPlaying: true });
    await poll();
    const counting = hook.current().beat;
    const playingDuringCountIn = hook.current().playing;
    ReactTestRenderer.act(() => hook.current().changePractice({ type: 'shiftTempo', delta: 5, writtenTempo: 120 }));
    await settle();
    await poll();

    // Assert
    expect(mockPlayer.play.mock.calls[0]?.[1]).toBe(0);
    expect(counting).toEqual({ index: 1, count: 4, isCountIn: true });
    expect(playingDuringCountIn).toBeUndefined();
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    expect(hook.current().beat).toEqual({ index: 1, count: 4, isCountIn: false });
    hook.unmount();
  });

  it('shows the beat of the bar being played', async () => {
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderHook(threeBars);
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    mockPlayer.position.mockResolvedValue({ seconds: 1.2, isPlaying: true });
    await poll();
    expect(hook.current().beat).toEqual({ index: 2, count: 4, isCountIn: false });
    hook.unmount();
  });
});

/** A hook whose song can be swapped, as an edit does. */
function renderEditableHook(first: Song): { current: () => Playback; setSong: (next: Song) => void; unmount: () => void } {
  let latest: Playback | undefined;
  function Probe({ played }: { played: Song }) {
    latest = usePlayback(played, 0);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe played={first} />);
  });
  return {
    current: () => latest!,
    setSong: (next) => ReactTestRenderer.act(() => renderer.update(<Probe played={next} />)),
    unmount: () => ReactTestRenderer.act(() => renderer.unmount()),
  };
}

describe('usePlayback while the song is edited', () => {
  it('stops when bars are added or deleted while playing, since every bar index it follows has moved', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderEditableHook(threeBars);
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();

    // Act: one bar fewer
    hook.setSong({ ...threeBars, measureHeaders: threeBars.measureHeaders.slice(0, 2), tracks: threeBars.tracks.map((track) => ({ ...track, measures: track.measures.slice(0, 2) })) });

    // Assert
    expect(hook.current().isPlaying).toBe(false);
    expect(mockPlayer.stop).toHaveBeenCalled();
    hook.unmount();
  });

  it('keeps playing through an edit that leaves the bars alone', async () => {
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderEditableHook(threeBars);
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    hook.setSong({ ...threeBars, tracks: threeBars.tracks.map((track) => ({ ...track, name: 'Edited' })) });
    expect(hook.current().isPlaying).toBe(true);
    hook.unmount();
  });

  it('stops and reports the error when the player cannot be read while playing', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderEditableHook(threeBars);
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    mockPlayer.position.mockRejectedValueOnce(new Error('player gone'));

    // Act
    await poll();

    // Assert
    expect(hook.current()).toMatchObject({ isPlaying: false, error: 'player gone' });
    hook.unmount();
  });

  const GUITAR = { id: 1, name: 'Guitar', program: 25, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };

  it('switches a track’s instrument live while playing: a program change, no restart', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const withChannel = { ...threeBars, channels: [GUITAR] };
    const hook = renderEditableHook(withChannel);
    ReactTestRenderer.act(() => hook.current().start(1));
    await settle();

    // Act
    hook.setSong({ ...withChannel, channels: [{ ...GUITAR, program: 30 }] });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Assert
    expect(mockPlayer.setProgram.mock.calls).toEqual([[0, 30], [1, 30]]);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(hook.current().isPlaying).toBe(true);
    hook.unmount();
  });

  it('changes a track’s volume live while playing: a control change, no restart', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const withChannel = { ...threeBars, channels: [GUITAR] };
    const hook = renderEditableHook(withChannel);
    ReactTestRenderer.act(() => hook.current().start(1));
    await settle();

    // Act
    hook.setSong({ ...withChannel, channels: [{ ...GUITAR, volume: 80 }] });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Assert
    expect(mockPlayer.setController.mock.calls).toEqual([[0, 7, 80], [1, 7, 80]]);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('restarts once when a track is muted while playing', async () => {
    // Arrange
    mockPlayer.play.mockResolvedValue(undefined);
    const withChannel = { ...threeBars, channels: [GUITAR] };
    const hook = renderEditableHook(withChannel);
    ReactTestRenderer.act(() => hook.current().start(1));
    await settle();

    // Act
    hook.setSong({ ...withChannel, tracks: withChannel.tracks.map((track) => ({ ...track, mute: true })) });
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
    });

    // Assert
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('restarts once, after the clicks stop, when the MIDI channels themselves changed', async () => {
    // Arrange: each edit adds a channel, which a live program change cannot follow
    mockPlayer.play.mockResolvedValue(undefined);
    const withChannel = { ...threeBars, channels: [GUITAR] };
    const hook = renderEditableHook(withChannel);
    ReactTestRenderer.act(() => hook.current().start(1));
    await settle();

    // Act
    hook.setSong({ ...withChannel, channels: [GUITAR, { ...GUITAR, id: 2 }] });
    hook.setSong({ ...withChannel, channels: [GUITAR, { ...GUITAR, id: 2 }, { ...GUITAR, id: 3 }] });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
    });

    // Assert
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('restarts on request (a new sound bank) only while playing, and not after a stop', async () => {
    mockPlayer.play.mockResolvedValue(undefined);
    const hook = renderEditableHook(threeBars);
    ReactTestRenderer.act(() => hook.current().restart());
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockPlayer.play).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => hook.current().start(0));
    await settle();
    ReactTestRenderer.act(() => hook.current().restart());
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    ReactTestRenderer.act(() => hook.current().restart());
    ReactTestRenderer.act(() => hook.current().stop());
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
});
