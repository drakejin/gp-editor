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
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

/** The native canvas becomes a plain host element, so its props can be read. */
jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

const BAR_COUNT = 40;

function rest(start: number): Beat {
  return { start, voices: [{ duration: QUARTER, notes: [], isEmpty: false, direction: 'none' }], stroke: NO_STROKE, pickStroke: 'none' };
}

/** Guitar (channel 1, volume 100, centred) with notes in bar 1; Bass (channel 2, volume 90, pan 30, muted) with rests. */
function buildSong(): Song {
  const headers = Array.from({ length: BAR_COUNT }, (_, i) => header(i + 1));
  const song = makeSong(headers.map((h, i) => (i === 0 ? [beat(toTux(h.start), [note(1, 3)])] : [])), headers);
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
    onToggleTrackShown: jest.fn(),
    onToggleMultitrack: jest.fn(),
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

  it('selects a track by its name and shows or hides it by its eye', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Track 2: Bass');
    panel.press('Show track 2 in the score');

    // Assert
    expect(panel.props.onSelectTrack).toHaveBeenCalledTimes(1);
    expect(panel.props.onSelectTrack).toHaveBeenCalledWith(1);
    expect(panel.props.onToggleTrackShown).toHaveBeenCalledWith(1);
  });

  it('marks the shown tracks’ eyes as on: the selected one alone, or those the multitrack view shows', () => {
    // Act
    const single = render({ selectedTrackIndex: 1 });
    const multitrack = render({ selectedTrackIndex: 1, shownTrackIndexes: [0, 1], isMultitrack: true });

    // Assert
    expect(single.control('Show track 2 in the score').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(single.control('Show track 1 in the score').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(multitrack.control('Show track 1 in the score').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });

  it('turns the multitrack view on and off from the lit Multitrack button over the table', () => {
    // Arrange
    const off = render();
    const on = render({ isMultitrack: true });

    // Act
    off.press('Multitrack: every track in the score (F3)');

    // Assert
    expect(off.props.onToggleMultitrack).toHaveBeenCalledTimes(1);
    expect(off.control('Multitrack: every track in the score (F3)').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(on.control('Multitrack: every track in the score (F3)').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
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

    // Assert: per track its name, eye, mute, solo, instrument, volume and pan, then Multitrack and the bar map
    const controls = panel.renderer.root.findAll(
      (node) => typeof node.props.onPress === 'function' || typeof node.props.onPressIn === 'function',
    );
    const labels = new Set(controls.map((node) => node.props.accessibilityLabel));
    expect(labels.has(undefined)).toBe(false);
    expect(labels.size).toBe(2 * 7 + 2);
    expect(controls.filter((node) => typeof node.props.tooltip !== 'string' || node.props.tooltip.length === 0)).toEqual([]);
  });
});

function trackActions() {
  return { onAddTrack: jest.fn(), onDuplicateTrack: jest.fn(), onDeleteTrack: jest.fn(), onMoveTrack: jest.fn() };
}

describe('TracksPanel track buttons', () => {
  it('adds a track, and duplicates, deletes and moves the selected one', () => {
    // Arrange
    const actions = trackActions();
    const panel = render({ trackActions: actions, selectedTrackIndex: 1 });

    // Act
    panel.press('Add a track (Track ▸ Add Track…, ⌥⌘N)');
    panel.press('Duplicate the selected track (Track ▸ Duplicate Track)');
    panel.press('Delete the selected track (Track ▸ Delete Track, ⌥⌘R)');
    panel.press('Move the selected track up (Track ▸ Move Track Up)');

    // Assert
    expect(actions.onAddTrack).toHaveBeenCalledTimes(1);
    expect(actions.onDuplicateTrack).toHaveBeenCalledWith(1);
    expect(actions.onDeleteTrack).toHaveBeenCalledWith(1);
    expect(actions.onMoveTrack).toHaveBeenCalledWith(1, 0);
  });

  it('cannot move the first track up, the last one down, or delete the only track', () => {
    const first = render({ trackActions: trackActions(), selectedTrackIndex: 0 });
    expect(first.control('Move the selected track up (Track ▸ Move Track Up)').props.disabled).toBe(true);
    expect(first.control('Move the selected track down (Track ▸ Move Track Down)').props.disabled).toBe(false);
    const last = render({ trackActions: trackActions(), selectedTrackIndex: 1 });
    expect(last.control('Move the selected track down (Track ▸ Move Track Down)').props.disabled).toBe(true);
    const single = render({ trackActions: trackActions(), song: { ...SONG, tracks: [SONG.tracks[0]!] } });
    expect(single.control('Delete the selected track (Track ▸ Delete Track, ⌥⌘R)').props.disabled).toBe(true);
  });

  it('shows no track buttons without track actions', () => {
    const panel = render();
    expect(panel.renderer.root.findAllByProps({ testID: 'tracks-panel-add-track' })).toEqual([]);
  });
});

describe('TracksPanel dragging a track', () => {
  const name = (panel: ReturnType<typeof render>, label: string) => panel.control(label);
  const pressAt = (pageY: number) => ({ nativeEvent: { pageY, locationX: 0, locationY: 0, pageX: 0 } });

  it('moves a track to the row its name is dropped on, marking where it goes meanwhile', () => {
    // Arrange
    const actions = trackActions();
    const panel = render({ trackActions: actions });
    const guitar = () => name(panel, 'Track 1: Guitar');

    // Act
    ReactTestRenderer.act(() => guitar().props.onPressIn(pressAt(100)));
    ReactTestRenderer.act(() => guitar().props.onPressMove(pressAt(100 + BAR_MAP.rowHeight)));
    const marker = panel.renderer.root.findAll((node) => node.props.pointerEvents === 'none' && typeof node.type === 'string');
    ReactTestRenderer.act(() => guitar().props.onPressOut(pressAt(100 + BAR_MAP.rowHeight)));
    ReactTestRenderer.act(() => guitar().props.onPress());

    // Assert
    expect(marker.length).toBeGreaterThan(0);
    expect(actions.onMoveTrack).toHaveBeenCalledWith(0, 1);
    expect(panel.props.onSelectTrack).not.toHaveBeenCalled();
  });

  it('selects the track on a click, and moves nothing for a drag back to its own row', () => {
    // Arrange
    const actions = trackActions();
    const panel = render({ trackActions: actions });
    const bass = () => name(panel, 'Track 2: Bass');

    // Act
    ReactTestRenderer.act(() => bass().props.onPressIn(pressAt(200)));
    ReactTestRenderer.act(() => bass().props.onPressOut(pressAt(202)));
    ReactTestRenderer.act(() => bass().props.onPress());
    ReactTestRenderer.act(() => bass().props.onPressIn(pressAt(200)));
    ReactTestRenderer.act(() => bass().props.onPressMove(pressAt(190)));
    ReactTestRenderer.act(() => bass().props.onPressOut(pressAt(198)));

    // Assert
    expect(panel.props.onSelectTrack).toHaveBeenCalledWith(1);
    expect(actions.onMoveTrack).not.toHaveBeenCalled();
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
    ReactTestRenderer.act(() => slider().props.onPressIn({ nativeEvent: { locationX: start, pageX: 500 } }));
    ReactTestRenderer.act(() => slider().props.onPressMove({ nativeEvent: { locationX: 0, pageX: 520 } }));
    ReactTestRenderer.act(() => slider().props.onPressMove({ nativeEvent: { locationX: 0, pageX: 900 } }));
    expect(panel.props.onSetTrackVolume).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => slider().props.onPressOut({ nativeEvent: { locationX: 0, pageX: 900 } }));

    // Assert
    expect(panel.props.onSetTrackVolume).toHaveBeenCalledTimes(1);
    expect(panel.props.onSetTrackVolume).toHaveBeenCalledWith(1, 127);
  });

  it('sets the pan from a click on its slider', () => {
    // Arrange: track 1 is centred
    const panel = render();
    const slider = () => panel.control('Pan of track 1');

    // Act: a click at the left end
    ReactTestRenderer.act(() => slider().props.onPressIn({ nativeEvent: { locationX: 0, pageX: 0 } }));
    ReactTestRenderer.act(() => slider().props.onPressOut({ nativeEvent: { locationX: 0, pageX: 0 } }));

    // Assert
    expect(panel.props.onSetTrackBalance).toHaveBeenCalledWith(0, 0);
  });

  it('disables the sliders of a track without a channel', () => {
    const panel = render({ song: { ...SONG, channels: [] } });
    expect(panel.control('Volume of track 1').props.disabled).toBe(true);
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

  it('offers Guitar Pro’s audio track button while the song has no audio track', () => {
    // Arrange
    const onAddAudioTrack = jest.fn();
    const panel = render({ onAddAudioTrack });

    // Act
    panel.press('Add an audio track');

    // Assert
    expect(onAddAudioTrack).toHaveBeenCalledTimes(1);
    expect(render().texts()).not.toContain('+ Audio Track');
  });
});
