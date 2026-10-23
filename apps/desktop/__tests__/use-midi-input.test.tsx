import ReactTestRenderer from 'react-test-renderer';
import type { PlayedNote } from '@gp-editor/core';
import { type MidiInput, useMidiInput } from '../src/hooks/use-midi-input';
import { CHORD_WINDOW_MS, type MidiNoteMessage } from '../src/lib/midi-input';
import type { MidiInputHandlers } from '../src/native/midi-input';

const KEYBOARD = { id: 11, name: 'Keystation 49' };
const GUITAR = { id: 12, name: 'MIDI guitar' };

const mockNative = {
  sources: jest.fn<Promise<readonly { id: number; name: string }[]>, []>(),
  listen: jest.fn<Promise<number>, [readonly number[]]>(),
  load: jest.fn<Promise<string | null>, []>(),
  save: jest.fn<Promise<void>, [string]>(),
  handlers: undefined as MidiInputHandlers | undefined,
};

jest.mock('../src/native/midi-input', () => ({
  listMidiSources: () => mockNative.sources(),
  listenToMidiSources: (ids: readonly number[]) => mockNative.listen(ids),
  loadMidiInputSettings: () => mockNative.load(),
  saveMidiInputSettings: (json: string) => mockNative.save(json),
  subscribeMidiInput: (handlers: MidiInputHandlers) => {
    mockNative.handlers = handlers;
    return () => {
      mockNative.handlers = undefined;
    };
  },
}));

const on = (key: number, channel = 0): MidiNoteMessage => ({ isOn: true, channel, key, velocity: 100 });

async function renderHook(onPlayed: (notes: readonly PlayedNote[]) => void): Promise<{ readonly current: () => MidiInput; readonly unmount: () => void }> {
  let latest: MidiInput | undefined;
  function Probe() {
    latest = useMidiInput(onPlayed);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return { current: () => latest!, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
}

async function act(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockNative.sources.mockResolvedValue([KEYBOARD, GUITAR]);
  mockNative.listen.mockImplementation((ids) => Promise.resolve(ids.length));
  mockNative.save.mockResolvedValue();
  mockNative.load.mockResolvedValue(JSON.stringify({ isEnabled: true, isGuitarMode: false, usesVelocity: false }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useMidiInput', () => {
  it('loads the saved settings and the sources, and listens to every source when on', async () => {
    const { current } = await renderHook(jest.fn());
    expect(current().settings.isEnabled).toBe(true);
    expect(current().sources).toEqual([KEYBOARD, GUITAR]);
    expect(mockNative.listen).toHaveBeenLastCalledWith([11, 12]);
    expect(current().listening).toBe(2);
  });

  it('enters notes struck together as one chord once the chord window has passed', async () => {
    // Arrange
    const onPlayed = jest.fn();
    await renderHook(onPlayed);

    // Act
    await act(() => {
      mockNative.handlers?.onNote(on(60));
      mockNative.handlers?.onNote(on(64));
      mockNative.handlers?.onNote(on(67));
    });
    expect(onPlayed).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(CHORD_WINDOW_MS));

    // Assert
    expect(onPlayed).toHaveBeenCalledTimes(1);
    expect(onPlayed).toHaveBeenCalledWith([{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }]);
  });

  it('ignores note-offs, and every note while input is off', async () => {
    const onPlayed = jest.fn();
    mockNative.load.mockResolvedValue(null);
    const { current } = await renderHook(onPlayed);
    await act(() => mockNative.handlers?.onNote(on(60)));
    await act(() => jest.advanceTimersByTime(CHORD_WINDOW_MS));
    expect(onPlayed).not.toHaveBeenCalled();
    expect(mockNative.listen).toHaveBeenLastCalledWith([]);
    await act(() => current().changeSettings({ isEnabled: true }));
    await act(() => mockNative.handlers?.onNote({ ...on(60), isOn: false }));
    await act(() => jest.advanceTimersByTime(CHORD_WINDOW_MS));
    expect(onPlayed).not.toHaveBeenCalled();
  });

  it('keeps a changed setting in user defaults and listens to the chosen source only', async () => {
    const { current } = await renderHook(jest.fn());
    await act(() => current().changeSettings({ sourceId: GUITAR.id, isGuitarMode: true }));
    expect(JSON.parse(mockNative.save.mock.calls.at(-1)![0])).toEqual({ isEnabled: true, sourceId: 12, isGuitarMode: true, usesVelocity: false });
    expect(mockNative.listen).toHaveBeenLastCalledWith([12]);
  });

  it('plays a MIDI guitar’s channels as strings', async () => {
    const onPlayed = jest.fn();
    const { current } = await renderHook(onPlayed);
    await act(() => current().changeSettings({ isGuitarMode: true }));
    await act(() => mockNative.handlers?.onNote(on(64, 1)));
    await act(() => jest.advanceTimersByTime(CHORD_WINDOW_MS));
    expect(onPlayed).toHaveBeenCalledWith([{ pitch: 64, string: 2 }]);
  });

  it('lists the sources again when a device comes or goes', async () => {
    const { current } = await renderHook(jest.fn());
    mockNative.sources.mockResolvedValue([KEYBOARD]);
    await act(() => mockNative.handlers?.onSourcesChanged());
    expect(current().sources).toEqual([KEYBOARD]);
    expect(mockNative.listen).toHaveBeenLastCalledWith([11]);
  });

  it('says when the MIDI sources cannot be read, and stops listening when unmounted', async () => {
    mockNative.sources.mockRejectedValue(new Error('MIDI is not available on this Mac.'));
    const { current, unmount } = await renderHook(jest.fn());
    expect(current().error).toBe('MIDI is not available on this Mac.');
    unmount();
    expect(mockNative.listen).toHaveBeenLastCalledWith([]);
  });
});
