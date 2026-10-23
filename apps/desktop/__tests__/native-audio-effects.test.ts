import {
  lineInLevel,
  loadLineInDevices,
  setPlayerMix,
  startLineIn,
  stopLineIn,
  subscribeLineInRequests,
  subscribeMixerRequests,
  updateLineIn,
} from '../src/native/audio-effects';

const SETTINGS = { deviceId: '', trackIndex: 0, gainDb: 0, isMonitoring: true };

describe('native effects and line in without the native module (tests, other platforms)', () => {
  it('keeps quiet: no mix to send, no devices, no level, and the line in cannot start', async () => {
    // Act
    const start = startLineIn(SETTINGS);
    const unsubscribeMixer = subscribeMixerRequests(jest.fn());
    const unsubscribeLineIn = subscribeLineInRequests(jest.fn());

    // Assert
    await expect(start).rejects.toThrow('The audio input is not available on this platform.');
    await expect(setPlayerMix({ tracks: [], master: { effects: [], gainDb: 0 } })).resolves.toBeUndefined();
    await expect(loadLineInDevices()).resolves.toEqual({ devices: [], defaultId: '', isOutputBuiltIn: false });
    await expect(updateLineIn(SETTINGS)).resolves.toBeUndefined();
    await expect(stopLineIn()).resolves.toBeUndefined();
    await expect(lineInLevel()).resolves.toBe(-120);
    expect(() => {
      unsubscribeMixer();
      unsubscribeLineIn();
    }).not.toThrow();
  });
});
