import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { type Song, TRACK_COLORS, TRACK_ICON_IDS } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { TRACK_INFO, TrackInfoPanel, type TrackInfoPanelProps, trackInfoPlacement } from '../src/components/track-info/TrackInfoPanel';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

const GUITAR = { id: 1, name: 'Guitar', program: 30, bank: 0, volume: 100, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };
const SONG: Song = withTrack({ ...makeSong([[beat(960, [note(1, 3)])]]), channels: [GUITAR] }, [[]], { name: 'Kit', isPercussion: true });

function render(overrides: Partial<TrackInfoPanelProps> = {}) {
  const props: TrackInfoPanelProps = {
    palette: PALETTE,
    song: SONG,
    trackIndex: 0,
    anchor: { x: 40, y: 700 },
    windowWidth: 1280,
    onSetTrackName: jest.fn(),
    onSetTrackShortName: jest.fn(),
    onSetTrackColor: jest.fn(),
    onSetTrackIcon: jest.fn(),
    onEditInstrument: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TrackInfoPanel {...props} />);
  });
  const control = (label: string) => {
    const [found] = renderer.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    if (found === undefined) {
      throw new Error(`no control "${label}"`);
    }
    return found;
  };
  const press = (label: string) => ReactTestRenderer.act(() => control(label).props.onPress());
  const button = (label: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.label === label);
  const field = (label: string) => renderer.root.findAllByType(TextInput).find((input) => input.props.accessibilityLabel === label);
  const type = (label: string, text: string, how: 'onSubmitEditing' | 'onBlur' = 'onSubmitEditing') => {
    ReactTestRenderer.act(() => field(label)?.props.onChangeText(text));
    ReactTestRenderer.act(() => field(label)?.props[how]());
  };
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, props, control, press, button, field, type, texts };
}

describe('TrackInfoPanel', () => {
  it('shows the track, its name and short name fields, Guitar Pro 8’s colours and icons', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['Track Information', '1. Guitar', 'Colour', 'Icon']));
    expect(panel.field('Name')?.props.value).toBe('Guitar');
    expect(panel.field('Short name')?.props.value).toBe('');
    expect(panel.field('Short name')?.props.placeholder).toBe('Guit.');
    expect(panel.renderer.root.findAll((node) => /^Colour #/.test(node.props.accessibilityLabel ?? '') && typeof node.props.onPress === 'function')).toHaveLength(TRACK_COLORS.length);
    expect(panel.control('Electric guitar').props.accessibilityState).toEqual({ selected: true });
    expect(panel.control('Banjo').props.accessibilityState).toEqual({ selected: false });
  });

  it('colours the track from a swatch or a typed #RRGGBB, ignoring anything else', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Colour #75CBDE');
    panel.type('Custom', '#a58ac1');
    panel.type('Custom', 'blue', 'onBlur');
    panel.type('Custom', 'ff0000');

    // Assert
    expect(panel.props.onSetTrackColor).toHaveBeenCalledTimes(2);
    expect(panel.props.onSetTrackColor).toHaveBeenNthCalledWith(1, 0, { r: 117, g: 203, b: 222 });
    expect(panel.props.onSetTrackColor).toHaveBeenNthCalledWith(2, 0, { r: 165, g: 138, b: 193 });
    expect(panel.field('Custom')?.props.value).toBe('#FF0000');
  });

  it('rings the track’s colour among the swatches', () => {
    const coloured: Song = { ...SONG, tracks: [{ ...SONG.tracks[0]!, color: TRACK_COLORS[2]! }, SONG.tracks[1]!] };
    const panel = render({ song: coloured });
    expect(panel.control('Colour #EABC7C').props.accessibilityState).toEqual({ selected: true });
    expect(panel.control('Colour #ED7474').props.accessibilityState).toEqual({ selected: false });
  });

  it('gives the track an icon, and its instrument’s again', () => {
    // Arrange
    const banjo: Song = { ...SONG, tracks: [{ ...SONG.tracks[0]!, iconId: TRACK_ICON_IDS.banjo }, SONG.tracks[1]!] };
    const following = render();
    const chosen = render({ song: banjo });

    // Act
    following.press('Ukulele');
    ReactTestRenderer.act(() => chosen.button('Instrument’s icon')?.props.onPress());

    // Assert
    expect(following.props.onSetTrackIcon).toHaveBeenCalledWith(0, TRACK_ICON_IDS.ukulele);
    expect(following.button('Instrument’s icon')?.props.isActive).toBe(true);
    expect(chosen.button('Instrument’s icon')?.props.isActive).toBe(false);
    expect(chosen.control('Banjo').props.accessibilityState).toEqual({ selected: true });
    expect(chosen.props.onSetTrackIcon).toHaveBeenCalledWith(0, undefined);
  });

  it('sets the name and the short name when the typing ends', () => {
    // Arrange
    const panel = render();

    // Act
    panel.type('Name', 'Lead Guitar');
    panel.type('Short name', 'L.Gt');

    // Assert
    expect(panel.props.onSetTrackName).toHaveBeenCalledWith(0, 'Lead Guitar');
    expect(panel.props.onSetTrackShortName).toHaveBeenCalledWith(0, 'L.Gt');
  });

  it('closes to open the instrument picker, which a drum track has not', () => {
    // Arrange
    const guitar = render();
    const drums = render({ trackIndex: 1 });

    // Act
    ReactTestRenderer.act(() => guitar.button('Instrument…')?.props.onPress());

    // Assert
    expect(guitar.props.onClose).toHaveBeenCalledTimes(1);
    expect(guitar.props.onEditInstrument).toHaveBeenCalledWith(0);
    expect(drums.button('Instrument…')?.props.isEnabled).toBe(false);
    expect(drums.control('Drums').props.accessibilityState).toEqual({ selected: true });
  });

  it('closes from ✕ and from a click outside, and draws nothing for a missing track', () => {
    // Arrange
    const panel = render();

    // Act
    ReactTestRenderer.act(() => panel.button('✕')?.props.onPress());
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'track-info-backdrop' }).props.onPress());

    // Assert
    expect(panel.props.onClose).toHaveBeenCalledTimes(2);
    expect(render({ trackIndex: 5 }).renderer.toJSON()).toBeNull();
  });

  it('gives every control a label and a tooltip', () => {
    const panel = render();
    const controls = panel.renderer.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityRole !== undefined);
    const unlabelled = controls.filter((node) => typeof node.props.accessibilityLabel !== 'string' || typeof node.props.tooltip !== 'string');
    expect(controls.length).toBeGreaterThan(TRACK_COLORS.length);
    expect(unlabelled.map((node) => String(node.props.accessibilityLabel))).toEqual([]);
  });
});

describe('trackInfoPlacement', () => {
  it('opens above a control near the bottom, from its left edge, inside the window', () => {
    expect(trackInfoPlacement({ x: 40, y: 700 }, 1280)).toEqual({ left: 40, top: 700 - TRACK_INFO.height - TRACK_INFO.gap });
    expect(trackInfoPlacement({ x: 1270, y: 700 }, 1280)).toEqual({ left: 1280 - TRACK_INFO.width - TRACK_INFO.margin, top: 700 - TRACK_INFO.height - TRACK_INFO.gap });
    expect(trackInfoPlacement({ x: 0, y: 700 }, 1280).left).toBe(TRACK_INFO.margin);
  });

  it('opens under a control with no room above it', () => {
    expect(trackInfoPlacement({ x: 900, y: 120 }, 1280).top).toBe(120 + TRACK_INFO.anchorHeight + TRACK_INFO.gap);
  });
});
