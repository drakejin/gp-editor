import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { LineInPanel } from '../src/components/effects/LineInPanel';
import type { LineIn } from '../src/hooks/use-line-in';
import { PALETTE } from '../test-support/score-helpers';

const MIC = { id: 'mic', name: 'MacBook Pro Microphone', isBuiltIn: true };
const INTERFACE = { id: 'usb', name: 'Guitar interface', isBuiltIn: false };

function lineIn(overrides: Partial<LineIn> = {}): LineIn {
  return {
    isOpen: true,
    open: jest.fn(),
    close: jest.fn(),
    devices: { devices: [MIC, INTERFACE], defaultId: 'mic', isOutputBuiltIn: true },
    deviceId: '',
    chooseDevice: jest.fn(),
    gainDb: 0,
    setGainDb: jest.fn(),
    isMonitoring: false,
    toggleMonitoring: jest.fn(),
    toggleLock: jest.fn(),
    remapTrack: jest.fn(),
    trackIndex: 1,
    isOn: false,
    turnOn: jest.fn(),
    turnOff: jest.fn(),
    levelDb: -30,
    ...overrides,
  };
}

function render(state: LineIn) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<LineInPanel palette={PALETTE} lineIn={state} trackLabel="2. Lead" />);
  });
  const press = (label: string) => {
    const button = renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    ReactTestRenderer.act(() => button.props.onPress());
  };
  const texts = () => renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { renderer, press, texts };
}

describe('LineInPanel', () => {
  it('warns about feedback with the Mac’s microphone and speakers, and shows the track and the level', () => {
    // Act
    const panel = render(lineIn());

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['LINE IN', '○ Off', '2. Lead', 'Default', 'Guitar interface']));
    expect(panel.texts().some((text) => text.includes('monitoring would howl'))).toBe(true);
    const meter = panel.renderer.root.findByProps({ testID: 'line-in-level' });
    expect([meter.props.style].flat().some((style: { width?: number } | null) => (style?.width ?? 0) > 100)).toBe(true);
  });

  it('chooses the input, locks the sound, monitors and turns on', () => {
    // Arrange
    const state = lineIn({ deviceId: 'usb' });
    const panel = render(state);

    // Act
    panel.press('Play from MacBook Pro Microphone');
    panel.press('Keep this track’s sound while you select other tracks');
    panel.press('Hear the input through the track’s effects');
    panel.press('Listen to the input (asks for microphone access the first time)');
    panel.press('Close the line in (it goes off)');

    // Assert
    expect(panel.texts().some((text) => text.includes('howl'))).toBe(false);
    expect(state.chooseDevice).toHaveBeenCalledWith('mic');
    expect(state.toggleLock).toHaveBeenCalled();
    expect(state.toggleMonitoring).toHaveBeenCalled();
    expect(state.turnOn).toHaveBeenCalled();
    expect(state.close).toHaveBeenCalled();
  });

  it('shows a locked sound, the on state and an error', () => {
    const state = lineIn({ isOn: true, lockedTrackIndex: 1, error: 'GP Editor may not use the audio input' });
    const panel = render(state);
    panel.press('Stop listening to the input');
    expect(panel.texts()).toEqual(expect.arrayContaining(['● On', 'Locked', 'Turn off', 'GP Editor may not use the audio input']));
    expect(state.turnOff).toHaveBeenCalled();
  });
});
