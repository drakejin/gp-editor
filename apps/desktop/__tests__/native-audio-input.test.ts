import { startAudioInput, stopAudioInput, subscribeAudioFrames, subscribeTunerRequests } from '../src/native/audio-input';

describe('native audio input without the native module (tests, other platforms)', () => {
  it('cannot start, stops quietly and sends no events', async () => {
    // Act
    const start = startAudioInput();
    const unsubscribeFrames = subscribeAudioFrames(jest.fn());
    const unsubscribeRequests = subscribeTunerRequests(jest.fn());

    // Assert
    await expect(start).rejects.toThrow('The microphone is not available on this platform.');
    await expect(stopAudioInput()).resolves.toBeUndefined();
    expect(() => {
      unsubscribeFrames();
      unsubscribeRequests();
    }).not.toThrow();
  });
});
