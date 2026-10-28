import { ScrollView, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { type AudioTrackMix, DEFAULT_MASTER, type Effect, type MasterMix, buildAudioTrack, buildEffect, setTrackEffects } from '@gp-editor/core';
import { MixerPanel } from '../src/components/effects/MixerPanel';
import type { MixPreview } from '../src/lib/mix';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const plain = makeSong([[beat(960, [note(1, 0)])]]);
const song = setTrackEffects({ ...plain, tracks: [plain.tracks[0]!, { ...plain.tracks[0]!, number: 2, name: 'Bass' }] }, 0, [buildEffect('drive'), buildEffect('reverb', false)]);

function render(selectedTrackIndex = 0) {
  const handlers = {
    onSelectTrack: jest.fn<void, [number]>(),
    onSetTrackEffects: jest.fn<void, [number, readonly Effect[]]>(),
    onSetMasterMix: jest.fn<void, [MasterMix]>(),
    onPreview: jest.fn<void, [MixPreview | undefined]>(),
    onClose: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<MixerPanel palette={PALETTE} song={song} selectedTrackIndex={selectedTrackIndex} {...handlers} />);
  });
  const press = (label: string) => {
    const button = renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    ReactTestRenderer.act(() => button.props.onPress());
  };
  const texts = () => renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { renderer, press, texts, ...handlers };
}

describe('MixerPanel', () => {
  it('shows each track strip’s colour and icon, the master none', () => {
    // Act
    const mixer = render();

    // Assert
    const icons = mixer.renderer.root.findAll((node) => typeof node.props.icon === 'string' && typeof node.props.size === 'number' && typeof node.type !== 'string');
    expect(icons.filter((node) => node.props.color === PALETTE.chromeText).map((node) => node.props.icon)).toEqual(expect.arrayContaining(['steelGuitar']));
    expect(new Set(icons.map((node) => node.props.icon)).size).toBe(1);
  });

  it('shows a strip per track and the master, and edits the selected track’s chain', () => {
    // Act
    const mixer = render();

    // Assert
    expect(mixer.texts()).toEqual(expect.arrayContaining(['1. Guitar', '● Drive', '○ Reverb', '2. Bass', 'Master', 'No effects', '0.0 dB', 'EFFECTS · Guitar']));
  });

  it('switches an effect from its strip, and selects a track from its name', () => {
    // Arrange
    const mixer = render();

    // Act
    mixer.press('Switch on Reverb on 1. Guitar');
    mixer.press('Edit the effects of 2. Bass');

    // Assert
    expect(mixer.onSetTrackEffects.mock.calls[0]?.[1].map((effect) => effect.isEnabled)).toEqual([true, true]);
    expect(mixer.onSelectTrack).toHaveBeenCalledWith(1);
  });

  it('edits the master strip once it is selected, and closes', () => {
    // Arrange
    const mixer = render();

    // Act
    mixer.press('Edit the effects of Master');
    mixer.press('Switch off Limiter on Master');
    mixer.press('Close the mixer');

    // Assert
    expect(mixer.texts()).toContain('MASTER');
    expect(mixer.onSetMasterMix.mock.calls[0]?.[0].effects[3]?.isEnabled).toBe(false);
    expect(mixer.onSetMasterMix.mock.calls[0]?.[0].gainDb).toBe(DEFAULT_MASTER.gainDb);
    expect(mixer.onClose).toHaveBeenCalled();
  });

  it('plays a dragged value of the selected track as a preview of that track', () => {
    // Arrange
    const mixer = render();

    // Act
    const slider = mixer.renderer.root.find((node) => node.props.accessibilityLabel === 'Drive' && typeof node.props.onPressIn === 'function');
    ReactTestRenderer.act(() => slider.props.onPressIn({ nativeEvent: { locationX: 0, pageX: 0 } }));

    // Assert
    const preview = mixer.onPreview.mock.calls[0]?.[0];
    expect(preview !== undefined && 'trackIndex' in preview ? [preview.trackIndex, preview.effects[0]?.params.gain] : undefined).toEqual([0, 0]);
  });

  it('shows the audio track’s strip with its volume, mute, solo and detune', () => {
    // Arrange
    const onSetAudioTrackMix = jest.fn<void, [AudioTrackMix]>();
    const withAudio = { ...song, audioTrack: buildAudioTrack({ assetId: 'take', solo: true }) };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MixerPanel palette={PALETTE} song={withAudio} selectedTrackIndex={0} onSelectTrack={jest.fn()} onSetTrackEffects={jest.fn()} onSetMasterMix={jest.fn()} onPreview={jest.fn()} onClose={jest.fn()} onSetAudioTrackMix={onSetAudioTrackMix} />,
      );
    });
    const press = (label: string) => ReactTestRenderer.act(() => renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress());

    // Act
    press('Solo the audio track');
    press('Detune a semitone up');

    // Assert
    expect(renderer.root.findAllByProps({ testID: 'mixer-audio-strip' }).length).toBeGreaterThan(0);
    expect(onSetAudioTrackMix.mock.calls).toEqual([[{ solo: false }], [{ detuneCents: 100 }]]);
  });

  it('keeps the audio track’s strip and the master strip in view, outside the track strips’ scroll', () => {
    // Arrange
    const many = { ...song, tracks: Array.from({ length: 9 }, (_, index) => ({ ...song.tracks[0]!, number: index + 1, name: `Track ${index + 1}` })) };
    const withAudio = { ...many, audioTrack: buildAudioTrack({ assetId: 'take' }) };

    // Act
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MixerPanel palette={PALETTE} song={withAudio} selectedTrackIndex={0} onSelectTrack={jest.fn()} onSetTrackEffects={jest.fn()} onSetMasterMix={jest.fn()} onPreview={jest.fn()} onClose={jest.fn()} onSetAudioTrackMix={jest.fn()} />,
      );
    });
    const strips = renderer.root.findAllByType(ScrollView).find((scroll) => scroll.props.horizontal === true);
    const labelsIn = (node: ReactTestRenderer.ReactTestInstance) =>
      node.findAll((each) => typeof each.props.accessibilityLabel === 'string').map((each) => each.props.accessibilityLabel as string);

    // Assert
    expect(strips).toBeDefined();
    expect(labelsIn(strips!)).toContain('Edit the effects of 9. Track 9');
    expect(strips!.findAllByProps({ testID: 'mixer-audio-strip' })).toHaveLength(0);
    expect(labelsIn(strips!)).not.toContain('Edit the effects of Master');
    expect(renderer.root.findAllByProps({ testID: 'mixer-audio-strip' }).length).toBeGreaterThan(0);
    expect(labelsIn(renderer.root)).toContain('Edit the effects of Master');
  });

  it('has no audio strip without an audio track', () => {
    // Arrange / Act
    const mixer = render();

    // Assert
    expect(mixer.renderer.root.findAllByProps({ testID: 'mixer-audio-strip' })).toHaveLength(0);
  });
});
