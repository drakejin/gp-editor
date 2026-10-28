import { audioData, audioPeaks, chooseAudioFile, isAudioLoaded, loadAudioData, subscribeAddAudioTrackRequests } from '../src/native/audio-track';

describe('the audio track without the native module (tests, other platforms)', () => {
  it('keeps no file: loading, fetching and the waveform fail, picking throws, nothing counts as loaded', async () => {
    // Act
    const unsubscribe = subscribeAddAudioTrackRequests(jest.fn());

    // Assert
    await expect(loadAudioData('AAAA', 'wav')).rejects.toThrow('The audio track is not available on this platform');
    await expect(audioData('id')).rejects.toThrow('not available');
    await expect(audioPeaks('id')).rejects.toThrow('not available');
    expect(() => chooseAudioFile(false)).toThrow('not available');
    expect(isAudioLoaded('id')).toBe(false);
    expect(() => unsubscribe()).not.toThrow();
  });
});
