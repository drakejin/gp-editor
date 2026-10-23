import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { STANDARD_TUNING } from '@gp-editor/core';
import { TunerPanel } from '../src/components/tuner/TunerPanel';
import { PALETTE } from '../test-support/score-helpers';
import { sineFrameEvent } from '../test-support/audio-frames';

const mockStart = jest.fn(() => Promise.resolve());
const mockStop = jest.fn(() => Promise.resolve());
let mockOnFrame: ((body: unknown) => void) | undefined;

jest.mock('../src/native/audio-input', () => ({
  startAudioInput: () => mockStart(),
  stopAudioInput: () => mockStop(),
  subscribeAudioFrames: (onFrame: (body: unknown) => void) => {
    mockOnFrame = onFrame;
    return () => undefined;
  },
}));

describe('TunerPanel', () => {
  it('listens while shown: the microphone’s frames reach the view, and closing stops the microphone', async () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <TunerPanel palette={PALETTE} strings={{ tuning: STANDARD_TUNING, caption: 'Guitar' }} referenceA4={440} onShiftReferenceA4={jest.fn()} onClose={jest.fn()} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    // Act
    ReactTestRenderer.act(() => mockOnFrame?.(sineFrameEvent(329.63)));
    const texts = renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
    ReactTestRenderer.act(() => renderer.unmount());

    // Assert
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(texts).toEqual(expect.arrayContaining(['E', '4', '329.6 Hz', 'Listening.']));
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});
