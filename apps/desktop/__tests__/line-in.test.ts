import { LINE_IN_GAIN, hasFeedbackRisk, levelFraction, lineInTrackIndex, parseLineInDevices } from '../src/lib/line-in';

const MIC = { id: 'BuiltInMicrophoneDevice', name: 'MacBook Pro Microphone', isBuiltIn: true };
const INTERFACE = { id: 'AppleUSBAudioEngine:1', name: 'Guitar interface', isBuiltIn: false };

describe('parseLineInDevices', () => {
  it('keeps well-formed devices and the defaults', () => {
    // Act
    const parsed = parseLineInDevices({ devices: [MIC, INTERFACE], defaultId: MIC.id, isOutputBuiltIn: true });

    // Assert
    expect(parsed).toEqual({ devices: [MIC, INTERFACE], defaultId: MIC.id, isOutputBuiltIn: true });
  });

  it('drops what is not a device and reads anything else as no devices', () => {
    expect(parseLineInDevices({ devices: [MIC, { id: 3 }, null, 'x'], defaultId: 7 })).toEqual({ devices: [MIC], defaultId: '', isOutputBuiltIn: false });
    expect(parseLineInDevices('nope')).toEqual({ devices: [], defaultId: '', isOutputBuiltIn: false });
  });
});

describe('hasFeedbackRisk', () => {
  it('warns when the Mac’s own microphone meets its own speakers', () => {
    const devices = { devices: [MIC, INTERFACE], defaultId: MIC.id, isOutputBuiltIn: true };
    expect(hasFeedbackRisk(devices, '')).toBe(true);
    expect(hasFeedbackRisk(devices, MIC.id)).toBe(true);
    expect(hasFeedbackRisk(devices, INTERFACE.id)).toBe(false);
    expect(hasFeedbackRisk({ ...devices, isOutputBuiltIn: false }, MIC.id)).toBe(false);
  });
});

describe('lineInTrackIndex', () => {
  it('follows the selected track unless the sound is locked to another', () => {
    expect(lineInTrackIndex({ lockedTrackIndex: undefined }, 2)).toBe(2);
    expect(lineInTrackIndex({ lockedTrackIndex: 0 }, 2)).toBe(0);
  });
});

describe('levelFraction', () => {
  it('maps −60…0 dBFS onto the meter', () => {
    expect(levelFraction(-120)).toBe(0);
    expect(levelFraction(-30)).toBeCloseTo(0.5);
    expect(levelFraction(3)).toBe(1);
    expect(LINE_IN_GAIN).toEqual({ min: -24, max: 24 });
  });
});
