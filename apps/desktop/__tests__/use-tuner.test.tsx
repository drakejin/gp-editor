import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_REFERENCE_A4, MAX_REFERENCE_A4, MIN_REFERENCE_A4 } from '@gp-editor/core';
import { type Tuner, type TunerListening, useTuner, useTunerListening } from '../src/hooks/use-tuner';
import { sineFrameEvent } from '../test-support/audio-frames';

const mockStart = jest.fn<Promise<void>, []>();
const mockStop = jest.fn<Promise<void>, []>();
const mockUnsubscribe = jest.fn();
let mockOnFrame: ((body: unknown) => void) | undefined;

jest.mock('../src/native/audio-input', () => ({
  startAudioInput: () => mockStart(),
  stopAudioInput: () => mockStop(),
  subscribeAudioFrames: (onFrame: (body: unknown) => void) => {
    mockOnFrame = onFrame;
    return mockUnsubscribe;
  },
}));

function renderHook<T>(hook: () => T) {
  let value: T | undefined;
  function Probe() {
    value = hook();
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe />);
  });
  return { current: () => value as T, renderer };
}

async function flush(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockStart.mockReset().mockResolvedValue(undefined);
  mockStop.mockReset().mockResolvedValue(undefined);
  mockUnsubscribe.mockReset();
  mockOnFrame = undefined;
});

describe('useTuner', () => {
  it('opens and closes the panel', () => {
    // Arrange
    const tuner = renderHook<Tuner>(useTuner);

    // Act
    ReactTestRenderer.act(() => tuner.current().open());
    const opened = tuner.current().isOpen;
    ReactTestRenderer.act(() => tuner.current().close());

    // Assert
    expect(opened).toBe(true);
    expect(tuner.current().isOpen).toBe(false);
  });

  it('steps the reference A4 by 1 Hz within 415–466 Hz', () => {
    // Arrange
    const tuner = renderHook<Tuner>(useTuner);

    // Act
    ReactTestRenderer.act(() => tuner.current().shiftReferenceA4(2));
    const raised = tuner.current().referenceA4;
    ReactTestRenderer.act(() => tuner.current().shiftReferenceA4(100));
    const highest = tuner.current().referenceA4;
    ReactTestRenderer.act(() => tuner.current().shiftReferenceA4(-200));

    // Assert
    expect(raised).toBe(DEFAULT_REFERENCE_A4 + 2);
    expect(highest).toBe(MAX_REFERENCE_A4);
    expect(tuner.current().referenceA4).toBe(MIN_REFERENCE_A4);
  });
});

describe('useTunerListening', () => {
  it('starts the microphone when mounted and listens', async () => {
    // Act
    const listening = renderHook<TunerListening>(useTunerListening);
    const starting = listening.current().status;
    await flush();

    // Assert
    expect(starting).toEqual({ kind: 'starting' });
    expect(listening.current().status).toEqual({ kind: 'listening' });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('reads the frames the microphone sends', async () => {
    // Arrange
    const listening = renderHook<TunerListening>(useTunerListening);
    await flush();

    // Act
    ReactTestRenderer.act(() => mockOnFrame?.(sineFrameEvent(110)));

    // Assert
    expect(listening.current().frequency).toBeCloseTo(110, 1);
    expect(listening.current().levelDb).toBeGreaterThan(-12);
  });

  it('stops the microphone and its frames when unmounted (the panel closed, the window gone)', async () => {
    // Arrange
    const listening = renderHook<TunerListening>(useTunerListening);
    await flush();

    // Act
    ReactTestRenderer.act(() => listening.renderer.unmount());

    // Assert
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('says when microphone access is off', async () => {
    // Arrange
    mockStart.mockRejectedValueOnce(Object.assign(new Error('Microphone access is off.'), { code: 'denied' }));

    // Act
    const listening = renderHook<TunerListening>(useTunerListening);
    await flush();

    // Assert
    expect(listening.current().status).toEqual({ kind: 'denied' });
  });

  it('shows any other failure to start', async () => {
    // Arrange
    mockStart.mockRejectedValueOnce(Object.assign(new Error('No microphone was found.'), { code: 'no_input' }));

    // Act
    const listening = renderHook<TunerListening>(useTunerListening);
    await flush();

    // Assert
    expect(listening.current().status).toEqual({ kind: 'failed', message: 'No microphone was found.' });
  });

  it('ignores an answer that comes after the panel closed', async () => {
    // Arrange
    let resolveStart: () => void = () => undefined;
    mockStart.mockReturnValueOnce(new Promise<void>((resolve) => (resolveStart = resolve)));
    const listening = renderHook<TunerListening>(useTunerListening);
    ReactTestRenderer.act(() => listening.renderer.unmount());

    // Act
    resolveStart();
    await flush();

    // Assert: still the state it had when it went away.
    expect(listening.current().status).toEqual({ kind: 'starting' });
  });
});
