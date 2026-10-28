import { buildAudioTrack, type Song } from '@gp-editor/core';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AudioTrackLane, type AudioTrackLaneProps } from '../src/components/audio-track/AudioTrackLane';
import type { AudioTrackLaneCommands } from '../src/hooks/use-audio-track';
import { laneX } from '../src/score/audio-lane';
import { PALETTE } from '../test-support/score-helpers';
import { makeSong } from '../test-support/songs';

/** The native canvas becomes a plain host element. */
jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

const PPS = 40;

/** Four bars of 4/4 at 120 BPM; bar 1 at 1 s and bar 3 at 6 s of the recording. */
function syncedSong(): Song {
  const syncPoints = [
    { measureIndex: 0, occurrence: 0, position: 0, seconds: 1 },
    { measureIndex: 2, occurrence: 0, position: 0, seconds: 6 },
  ];
  return { ...makeSong([[], [], [], []]), audioTrack: buildAudioTrack({ assetId: 'take', originalFilePath: '/Music/Band take.wav', syncPoints }) };
}

function laneCommands(overrides: Partial<AudioTrackLaneCommands> = {}): jest.Mocked<AudioTrackLaneCommands> {
  return {
    durationSeconds: 12,
    pixelsPerSecond: PPS,
    canZoomIn: true,
    canZoomOut: true,
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    selectPoint: jest.fn(),
    setMix: jest.fn(),
    movePoint: jest.fn(),
    deleteSelectedPoint: jest.fn(),
    markSyncPoint: jest.fn(),
    tempoFromAudio: jest.fn(),
    addAudioTrack: jest.fn(),
    removeAudioTrack: jest.fn(),
    pointRange: jest.fn(() => ({ min: 1, max: Number.POSITIVE_INFINITY })),
    ...overrides,
  } as jest.Mocked<AudioTrackLaneCommands>;
}

function render(lane: AudioTrackLaneCommands, overrides: Partial<AudioTrackLaneProps> = {}) {
  const song = syncedSong();
  const onSelectBar = jest.fn();
  const props: AudioTrackLaneProps = { song, audioTrack: song.audioTrack!, lane, cursorMeasureIndex: 1, palette: PALETTE, onSelectBar, ...overrides };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<AudioTrackLane {...props} />);
  });
  const press = (label: string) => {
    const [found] = renderer.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found === undefined) {
      throw new Error(`no button "${label}"`);
    }
    ReactTestRenderer.act(() => found.props.onPress());
  };
  const waveform = renderer.root.find((node) => node.props.testID === 'audio-lane-waveform' && typeof node.props.onPressIn === 'function');
  const event = (x: number, pageX = x) => ({ nativeEvent: { locationX: x, pageX } });
  return { renderer, press, waveform, event, onSelectBar };
}

describe('AudioTrackLane', () => {
  it('names the track and its file, and offers its tools', () => {
    // Arrange / Act
    const { renderer } = render(laneCommands());

    // Assert
    const texts = renderer.root.findAllByType(Text).map((text) => text.props.children);
    expect(texts).toEqual(expect.arrayContaining(['♫ Audio Track', 'Band take.wav', 'Sync bar 2 (Y)', '0 ¢']));
  });

  it('runs its buttons: replace, remove, sync, delete, tempo, zoom, mute and detune', () => {
    // Arrange
    const lane = laneCommands({ selectedPointIndex: 0 });
    const { press } = render(lane);

    // Act
    for (const label of ['Replace the recording with another audio file', 'Remove the audio track', 'While it plays: bar 2 starts at this moment of the recording (Y)', 'Delete the selected sync point', "Set the song's tempo from the first two sync points", 'Zoom into the waveform', 'Zoom out of the waveform', 'Mute the audio track', 'Detune 10 cents up', 'Detune a semitone down']) {
      press(label);
    }

    // Assert
    expect(lane.addAudioTrack).toHaveBeenCalled();
    expect(lane.removeAudioTrack).toHaveBeenCalled();
    expect(lane.markSyncPoint).toHaveBeenCalled();
    expect(lane.deleteSelectedPoint).toHaveBeenCalled();
    expect(lane.tempoFromAudio).toHaveBeenCalled();
    expect(lane.zoomIn).toHaveBeenCalled();
    expect(lane.zoomOut).toHaveBeenCalled();
    expect(lane.setMix.mock.calls).toEqual([[{ mute: true }], [{ detuneCents: 10 }], [{ detuneCents: -100 }]]);
  });

  it('selects the marker under a click and moves it when dragged', () => {
    // Arrange
    const lane = laneCommands();
    const { waveform, event } = render(lane);
    const markerX = laneX(6, PPS);

    // Act
    ReactTestRenderer.act(() => waveform.props.onPressIn(event(markerX + 2, 500)));
    ReactTestRenderer.act(() => waveform.props.onPressMove(event(0, 500 + 2 * PPS)));
    ReactTestRenderer.act(() => waveform.props.onPressOut(event(0, 500 + 2 * PPS)));

    // Assert
    expect(lane.selectPoint).toHaveBeenCalledWith(1);
    expect(lane.pointRange).toHaveBeenCalledWith(1);
    expect(lane.movePoint).toHaveBeenCalledWith(1, 8 + 2 / PPS);
  });

  it('goes to the bar heard where a click away from the markers lands', () => {
    // Arrange
    const lane = laneCommands();
    const { waveform, event, onSelectBar } = render(lane);

    // Act
    ReactTestRenderer.act(() => waveform.props.onPressIn(event(laneX(4, PPS))));
    ReactTestRenderer.act(() => waveform.props.onPressOut(event(laneX(4, PPS))));

    // Assert
    expect(onSelectBar).toHaveBeenCalledWith(1);
    expect(lane.selectPoint).toHaveBeenCalledWith(undefined);
    expect(lane.movePoint).not.toHaveBeenCalled();
  });

  it('says why there is no waveform when the recording could not be loaded', () => {
    // Arrange / Act
    const { renderer } = render(laneCommands({ error: 'The recording is not loaded' }));

    // Assert
    const texts = renderer.root.findAllByType(Text).map((text) => text.props.children);
    expect(texts).toContain('The recording is not loaded');
  });
});
