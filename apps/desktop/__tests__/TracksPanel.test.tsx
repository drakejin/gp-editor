import { DEFAULT_CHANNEL, NO_STROKE, QUARTER } from '@gp-editor/core';
import type { Beat, Song, Track } from '@gp-editor/core';
import { ScrollView, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { sliderThumbX } from '../src/components/MixerSlider';
import { TRACK_TABLE } from '../src/components/TrackMixerRow';
import { TracksPanel, type TracksPanelProps } from '../src/components/TracksPanel';
import { ScoreCanvas } from '../src/native/score-canvas';
import { BAR_MAP, barMapCellX, barMapHeight, barMapWidth, scrollOffsetToShowBar } from '../src/score/bar-map';
import type { DrawCommand } from '../src/score/draw';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

/** The native canvas becomes a plain host element, so its props can be read. */
jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

const BAR_COUNT = 40;

function rest(start: number): Beat {
  return { start, voices: [{ duration: QUARTER, notes: [], isEmpty: false, direction: 'none' }], stroke: NO_STROKE, pickStroke: 'none' };
}

/** Guitar (channel 1, volume 100, centred) with notes in bar 1; Bass (channel 2, volume 90, pan 30, muted) with rests. */
function buildSong(): Song {
  const headers = Array.from({ length: BAR_COUNT }, (_, i) => header(i + 1));
  const song = makeSong(headers.map((h, i) => (i === 0 ? [beat(h.start, [note(1, 3)])] : [])), headers);
  const guitar = song.tracks[0]!;
  const bass: Track = { ...guitar, number: 2, name: 'Bass', channelId: 2, mute: true, measures: guitar.measures.map((m, i) => ({ ...m, beats: [rest(headers[i]!.start)] })) };
  const channels = [
    { ...DEFAULT_CHANNEL, id: 1, program: 30, volume: 100, balance: 64 },
    { ...DEFAULT_CHANNEL, id: 2, program: 33, volume: 90, balance: 30 },
  ];
  return { ...song, channels, tracks: [guitar, bass] };
}

const SONG = buildSong();

function render(overrides: Partial<TracksPanelProps> = {}) {
  const props: TracksPanelProps = {
    song: SONG,
    selectedTrackIndex: 0,
    palette: PALETTE,
    onSelectTrack: jest.fn(),
    onSelectBar: jest.fn(),
    onSetTrackMute: jest.fn(),
    onSetTrackSolo: jest.fn(),
    onSetTrackVolume: jest.fn(),
    onSetTrackBalance: jest.fn(),
    onEditInstrument: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TracksPanel {...props} />);
  });
  /** The outermost element with this accessibility label and a role: the Pressable, or the slider's view. */
  const control = (label: string) => {
    const [found] = renderer.root.findAll((node) => node.props.accessibilityLabel === label && node.props.accessibilityRole !== undefined);
    if (found === undefined) {
      throw new Error(`no control "${label}"`);
    }
    return found;
  };
  const press = (label: string) => ReactTestRenderer.act(() => control(label).props.onPress());
  const barMap = () => renderer.root.findByProps({ testID: 'tracks-panel-bar-map' });
  const pressMap = (x: number, y: number) => ReactTestRenderer.act(() => barMap().props.onPress({ nativeEvent: { locationX: x, locationY: y } }));
  const canvas = () => barMap().findByType(ScoreCanvas) as ReactTestRenderer.ReactTestInstance;
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const update = (next: Partial<TracksPanelProps>) => ReactTestRenderer.act(() => renderer.update(<TracksPanel {...props} {...next} />));
  return { renderer, props, control, press, pressMap, canvas, texts, update };
}

/** The horizontal scroll view holding the bar map. */
function barScroll(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const [found] = renderer.root.findAllByType(ScrollView).filter((node) => node.props.horizontal === true);
  if (found === undefined) {
    throw new Error('no horizontal scroll view');
  }
  return found;
}

const cellCentre = (measureIndex: number) => barMapCellX(measureIndex) + BAR_MAP.cellWidth / 2;
const rowCentre = (trackIndex: number) => BAR_MAP.headerHeight + (trackIndex + 0.5) * BAR_MAP.rowHeight;

describe('TracksPanel table', () => {
  it('lists every track by number and name', () => {
    const panel = render();
    expect(panel.texts()).toEqual(expect.arrayContaining(['Tracks', '1. Guitar', '2. Bass']));
  });

  it('selects a track by its name or its eye', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Track 2: Bass');
    panel.press('Show track 2 in the score');

    // Assert
    expect(panel.props.onSelectTrack).toHaveBeenCalledTimes(2);
    expect(panel.props.onSelectTrack).toHaveBeenNthCalledWith(1, 1);
    expect(panel.props.onSelectTrack).toHaveBeenNthCalledWith(2, 1);
  });

  it('marks the shown track’s eye as on', () => {
    const panel = render({ selectedTrackIndex: 1 });
    expect(panel.control('Show track 2 in the score').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(panel.control('Show track 1 in the score').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
  });

  it('toggles mute and solo from the track’s current state', () => {
    // Arrange: the bass is muted, nothing is soloed
    const panel = render();

    // Act
    panel.press('Mute track 1');
    panel.press('Mute track 2');
    panel.press('Solo track 2');

    // Assert
    expect(panel.props.onSetTrackMute).toHaveBeenNthCalledWith(1, 0, true);
    expect(panel.props.onSetTrackMute).toHaveBeenNthCalledWith(2, 1, false);
    expect(panel.props.onSetTrackSolo).toHaveBeenCalledWith(1, true);
  });

  it('opens the instrument picker from a pitched track’s icon, not from a drum track’s', () => {
    // Arrange
    const drums: Song = { ...SONG, tracks: [SONG.tracks[0]!, { ...SONG.tracks[1]!, isPercussion: true }] };
    const panel = render({ song: drums });

    // Act
    panel.press('Instrument of track 1');

    // Assert
    expect(panel.props.onEditInstrument).toHaveBeenCalledWith(0);
    expect(panel.control('Instrument of track 2').props.disabled).toBe(true);
  });

  it('gives every control a label and a tooltip', () => {
    // Act
    const panel = render();

    // Assert: per track its name, eye, mute, solo, instrument, volume and pan, then the bar map
    const controls = panel.renderer.root.findAll(
      (node) => typeof node.props.onPress === 'function' || typeof node.props.onResponderGrant === 'function',
    );
    const labels = new Set(controls.map((node) => node.props.accessibilityLabel));
    expect(labels.has(undefined)).toBe(false);
    expect(labels.size).toBe(2 * 7 + 1);
    expect(controls.filter((node) => typeof node.props.tooltip !== 'string' || node.props.tooltip.length === 0)).toEqual([]);
  });
});

describe('TracksPanel mixer', () => {
  it('shows each track’s channel volume and pan', () => {
    const panel = render();
    expect(panel.control('Volume of track 2').props.accessibilityValue).toEqual(expect.objectContaining({ now: 90 }));
    expect(panel.control('Pan of track 2').props.accessibilityValue).toEqual(expect.objectContaining({ now: 30, text: 'L 34' }));
  });

  it('sets the volume once, when the drag ends, clamped to 127', () => {
    // Arrange
    const panel = render();
    const slider = () => panel.control('Volume of track 2');
    const start = sliderThumbX(90, TRACK_TABLE.volumeWidth);

    // Act
    ReactTestRenderer.act(() => slider().props.onResponderGrant({ nativeEvent: { locationX: start, pageX: 500 } }));
    ReactTestRenderer.act(() => slider().props.onResponderMove({ nativeEvent: { locationX: 0, pageX: 520 } }));
    ReactTestRenderer.act(() => slider().props.onResponderMove({ nativeEvent: { locationX: 0, pageX: 900 } }));
    expect(panel.props.onSetTrackVolume).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => slider().props.onResponderRelease({ nativeEvent: { locationX: 0, pageX: 900 } }));

    // Assert
    expect(panel.props.onSetTrackVolume).toHaveBeenCalledTimes(1);
    expect(panel.props.onSetTrackVolume).toHaveBeenCalledWith(1, 127);
  });

  it('sets the pan from a click on its slider', () => {
    // Arrange: track 1 is centred
    const panel = render();
    const slider = () => panel.control('Pan of track 1');

    // Act: a click at the left end
    ReactTestRenderer.act(() => slider().props.onResponderGrant({ nativeEvent: { locationX: 0, pageX: 0 } }));
    ReactTestRenderer.act(() => slider().props.onResponderRelease({ nativeEvent: { locationX: 0, pageX: 0 } }));

    // Assert
    expect(panel.props.onSetTrackBalance).toHaveBeenCalledWith(0, 0);
  });

  it('disables the sliders of a track without a channel', () => {
    const panel = render({ song: { ...SONG, channels: [] } });
    expect(panel.control('Volume of track 1').props.onStartShouldSetResponder()).toBe(false);
  });
});

describe('TracksPanel bar map', () => {
  it('draws the map at its full size', () => {
    // Act
    const { commands, style } = render().canvas().props as { commands: readonly DrawCommand[]; style: unknown };

    // Assert
    expect(commands.length).toBeGreaterThan(2 * BAR_COUNT);
    expect(style).toEqual({ width: barMapWidth(SONG), height: barMapHeight(SONG) });
  });

  it('jumps to the track and bar of a clicked cell', () => {
    // Arrange
    const panel = render();

    // Act
    panel.pressMap(cellCentre(7), rowCentre(1));

    // Assert
    expect(panel.props.onSelectBar).toHaveBeenCalledWith(1, 7);
  });

  it('jumps to a bar of the selected track from the bar numbers', () => {
    const panel = render({ selectedTrackIndex: 1 });
    panel.pressMap(cellCentre(4), BAR_MAP.headerHeight / 2);
    expect(panel.props.onSelectBar).toHaveBeenCalledWith(1, 4);
  });

  it('ignores a click past the last bar', () => {
    const panel = render();
    panel.pressMap(barMapWidth(SONG) + 10, rowCentre(0));
    expect(panel.props.onSelectBar).not.toHaveBeenCalled();
  });

  it('scrolls the cursor’s bar into view when it moves out of sight', () => {
    // Arrange: a map 150 pt wide, scrolled to the start
    const panel = render({ cursorMeasureIndex: 0 });
    const scroll = barScroll(panel.renderer);
    const scrollTo = scroll.instance.scrollTo as jest.Mock;
    ReactTestRenderer.act(() => scroll.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 150, height: 100 } } }));
    scrollTo.mockClear();

    // Act
    panel.update({ cursorMeasureIndex: 30 });

    // Assert
    expect(scrollTo).toHaveBeenCalledWith({ x: scrollOffsetToShowBar(30, 0, 150), animated: false });
  });

  it('follows the playing bar while playing', () => {
    // Arrange
    const panel = render({ cursorMeasureIndex: 0 });
    const scroll = barScroll(panel.renderer);
    const scrollTo = scroll.instance.scrollTo as jest.Mock;
    ReactTestRenderer.act(() => scroll.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 150, height: 100 } } }));
    scrollTo.mockClear();

    // Act
    panel.update({ cursorMeasureIndex: 0, playingMeasureIndex: 20 });

    // Assert
    expect(scrollTo).toHaveBeenCalledWith({ x: scrollOffsetToShowBar(20, 0, 150), animated: false });
  });
});
