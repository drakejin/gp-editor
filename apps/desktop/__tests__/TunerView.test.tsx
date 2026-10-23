import { StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MAX_REFERENCE_A4, STANDARD_TUNING } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { IN_TUNE_COLOR } from '../src/components/tuner/TunerMeters';
import { TunerView, type TunerViewProps } from '../src/components/tuner/TunerView';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<TunerViewProps> = {}) {
  const props: TunerViewProps = {
    palette: PALETTE,
    status: { kind: 'listening' },
    levelDb: -24,
    frequency: 112,
    referenceA4: 440,
    strings: { tuning: STANDARD_TUNING, caption: 'Guitar · E A D G B E' },
    onShiftReferenceA4: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TunerView {...props} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((found) => found.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const labelled = (label: string) => renderer.root.findAll((node) => node.type === View && node.props.accessibilityLabel === label);
  const textNamed = (content: string) => renderer.root.findAllByType(Text).find((text) => [text.props.children].flat().join('') === content);
  return { props, renderer, button, press, texts, labelled, textNamed };
}

describe('TunerView', () => {
  it('shows the nearest note, how far off it is and the frequency', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['A', '2', '+31 ¢', '112.0 Hz', 'Guitar · E A D G B E']));
  });

  it('lights the nearest string of the track, from the lowest', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.labelled('String 5, A2, nearest: +31 ¢')).toHaveLength(1);
    expect(panel.labelled('String 6, E2')).toHaveLength(1);
  });

  it('turns the note green within 5 cents', () => {
    // Act
    const inTune = render({ frequency: 110.2 });
    const sharp = render({ frequency: 112 });

    // Assert
    expect(StyleSheet.flatten(inTune.textNamed('A')?.props.style).color).toBe(IN_TUNE_COLOR);
    expect(StyleSheet.flatten(sharp.textNamed('A')?.props.style).color).not.toBe(IN_TUNE_COLOR);
  });

  it('asks for a note while nothing is played', () => {
    // Act
    const panel = render({ frequency: undefined });

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['–', '– Hz', 'Play one string at a time.']));
  });

  it('explains how to allow the microphone when access is off', () => {
    // Act
    const panel = render({ status: { kind: 'denied' }, frequency: undefined });

    // Assert
    expect(panel.texts().some((text) => text.startsWith('Microphone access is off.'))).toBe(true);
  });

  it('shows the input level, a dash for silence', () => {
    expect(render({ levelDb: -24.4 }).labelled('Input level -24 dB')).toHaveLength(1);
    expect(render({ levelDb: -120, frequency: undefined }).texts()).toContain('– dB');
  });

  it('steps the reference A4, up to its limit', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Lower the reference A4 by 1 Hz');
    panel.press('Raise the reference A4 by 1 Hz');

    // Assert
    expect(panel.texts()).toContain('A4 = 440 Hz');
    expect((panel.props.onShiftReferenceA4 as jest.Mock).mock.calls).toEqual([[-1], [1]]);
    expect(render({ referenceA4: MAX_REFERENCE_A4 }).button('Raise the reference A4 by 1 Hz')?.props.isEnabled).toBe(false);
  });

  it('closes from its button and from a click outside', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Close the tuner (Esc)');
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'tuner-backdrop' }).props.onPress());

    // Assert
    expect(panel.props.onClose).toHaveBeenCalledTimes(2);
  });
});
