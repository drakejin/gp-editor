import ReactTestRenderer from 'react-test-renderer';
import { type LineIn, useLineIn } from '../src/hooks/use-line-in';
import type { LineInSettings } from '../src/native/audio-effects';

const MIC = { id: 'mic', name: 'MacBook Pro Microphone', isBuiltIn: true };
const INTERFACE = { id: 'usb', name: 'Guitar interface', isBuiltIn: false };

const mockNative = {
  devices: jest.fn(() => Promise.resolve<unknown>({ devices: [MIC, INTERFACE], defaultId: 'mic', isOutputBuiltIn: true })),
  start: jest.fn((_settings: LineInSettings) => Promise.resolve()),
  update: jest.fn((_settings: LineInSettings) => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  level: jest.fn(() => Promise.resolve(-12)),
};

jest.mock('../src/native/audio-effects', () => ({
  loadLineInDevices: () => mockNative.devices(),
  startLineIn: (settings: LineInSettings) => mockNative.start(settings),
  updateLineIn: (settings: LineInSettings) => mockNative.update(settings),
  stopLineIn: () => mockNative.stop(),
  lineInLevel: () => mockNative.level(),
}));

function renderHook(trackIndex: number) {
  let latest: LineIn | undefined;
  function Probe({ selected }: { readonly selected: number }) {
    latest = useLineIn(selected);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe selected={trackIndex} />);
  });
  return {
    current: () => latest!,
    select: (selected: number) => ReactTestRenderer.act(() => renderer.update(<Probe selected={selected} />)),
    unmount: () => ReactTestRenderer.act(() => renderer.unmount()),
  };
}

async function settle(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useLineIn', () => {
  it('lists the inputs when opened, with monitoring off for the Mac’s own microphone and speakers', async () => {
    // Arrange
    const hook = renderHook(0);

    // Act
    ReactTestRenderer.act(() => hook.current().open());
    await settle();

    // Assert
    expect(hook.current()).toMatchObject({ isOpen: true, isOn: false, isMonitoring: false, deviceId: '' });
    expect(hook.current().devices.devices).toEqual([MIC, INTERFACE]);
    hook.unmount();
  });

  it('starts on the selected track, follows the selection, and stays on a locked track', async () => {
    // Arrange
    const hook = renderHook(1);
    ReactTestRenderer.act(() => hook.current().open());
    await settle();

    // Act
    ReactTestRenderer.act(() => hook.current().chooseDevice('usb'));
    ReactTestRenderer.act(() => hook.current().turnOn());
    await settle();
    hook.select(2);
    ReactTestRenderer.act(() => hook.current().toggleLock());
    hook.select(0);

    // Assert
    expect(mockNative.start).toHaveBeenCalledWith({ deviceId: 'usb', trackIndex: 1, gainDb: 0, isMonitoring: false });
    expect(mockNative.update.mock.calls.map(([settings]) => settings.trackIndex)).toEqual([1, 2]);
    expect(hook.current()).toMatchObject({ isOn: true, lockedTrackIndex: 2, trackIndex: 2 });
    hook.unmount();
    expect(mockNative.stop).toHaveBeenCalled();
  });

  it('keeps the lock on its track when tracks move, and lets go when its track is deleted', () => {
    // Arrange
    const hook = renderHook(2);
    ReactTestRenderer.act(() => hook.current().toggleLock());

    // Act
    ReactTestRenderer.act(() => hook.current().remapTrack([1, 2, 0]));
    const moved = hook.current().lockedTrackIndex;
    ReactTestRenderer.act(() => hook.current().remapTrack([undefined, 0, 1]));

    // Assert
    expect(moved).toBe(0);
    expect(hook.current().lockedTrackIndex).toBeUndefined();
    expect(hook.current().trackIndex).toBe(2);
    hook.unmount();
  });

  it('sends a new gain and monitoring at once, and reads the level while on', async () => {
    // Arrange
    const hook = renderHook(0);
    ReactTestRenderer.act(() => hook.current().turnOn());
    await settle();

    // Act
    ReactTestRenderer.act(() => hook.current().setGainDb(40));
    ReactTestRenderer.act(() => hook.current().toggleMonitoring());
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(150);
      await Promise.resolve();
    });

    // Assert
    expect(mockNative.update).toHaveBeenLastCalledWith({ deviceId: '', trackIndex: 0, gainDb: 24, isMonitoring: false });
    expect(hook.current().levelDb).toBe(-12);
    hook.unmount();
  });

  it('turns off when its panel closes, and shows why it could not start', async () => {
    // Arrange
    const hook = renderHook(0);
    ReactTestRenderer.act(() => hook.current().open());
    ReactTestRenderer.act(() => hook.current().turnOn());
    await settle();

    // Act
    ReactTestRenderer.act(() => hook.current().close());
    mockNative.start.mockRejectedValueOnce(new Error('GP Editor may not use the audio input'));
    ReactTestRenderer.act(() => hook.current().turnOn());
    await settle();

    // Assert
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(hook.current()).toMatchObject({ isOpen: false, isOn: false, error: 'GP Editor may not use the audio input' });
    hook.unmount();
  });
});
