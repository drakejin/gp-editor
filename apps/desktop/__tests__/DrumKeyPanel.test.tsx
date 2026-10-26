import { StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Song } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { DrumKeyColumn } from '../src/components/drum-key/DrumKeyColumn';
import { DrumKeyPanel } from '../src/components/drum-key/DrumKeyPanel';
import type { DrumKey } from '../src/hooks/use-drum-key';
import { WHOLE_KIT_KEYS } from '../src/lib/drum-key';
import { ScoreCanvas } from '../src/native/score-canvas';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

/** Track 1: a guitar; track 2: drums — kick, snare, closed and open hi-hat, crash. */
const SONG: Song = (() => {
  const base = withTrack(makeSong([[beat(960, [note(1, 3)])]]), [[beat(960, [note(1, 36), note(2, 42)]), beat(1920, [note(1, 38), note(2, 46)]), beat(2880, [note(1, 49)])]]);
  return { ...base, tracks: base.tracks.map((track, i) => (i === 1 ? { ...track, name: 'Drums', isPercussion: true } : track)) };
})();

function drumKeyOf(overrides: Partial<DrumKey> = {}): DrumKey {
  return { isOpen: true, showsWholeKit: false, setShowsWholeKit: jest.fn(), toggle: jest.fn(), close: jest.fn(), ...overrides };
}

function render(trackIndex: number, drumKey: DrumKey = drumKeyOf()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<DrumKeyPanel palette={PALETTE} song={SONG} trackIndex={trackIndex} drumKey={drumKey} />);
  });
  const root = renderer.root;
  // The card is laid out once its room over the score is measured.
  const room = root.findAll((node) => typeof node.props.onLayout === 'function' && node.props.pointerEvents === 'box-none')[0]!;
  ReactTestRenderer.act(() => room.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1000, height: 600 } } }));
  const texts = () => root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const button = (label: string) => root.findAllByType(ChromeButton).find((candidate) => candidate.props.label === label);
  // DrumKeyColumn is memoised: its element is found by its props.
  const groups = () => root.findAll((node) => node.type === DrumKeyColumn || (node.props.group !== undefined && typeof node.props.onLight === 'function'));
  const columns = () =>
    [...new Map(groups().map((node) => [node.props.group.id, node.props.group.entries.map((entry: { key: number }) => entry.key)])).entries()];
  return { root, texts, button, columns };
}

describe('DrumKeyPanel', () => {
  it('names the drums the cursor’s drum track uses, a column per element, low to high', () => {
    // Act
    const panel = render(1);

    // Assert
    expect(panel.columns()).toEqual([
      ['kickDrum', [36]],
      ['snare', [38]],
      ['hiHat', [42, 46]],
      ['crash', [49]],
    ]);
    expect(panel.texts()).toEqual(expect.arrayContaining(['Drum Key', '2. Drums', 'Kick', 'Hi-Hat', 'Closed', 'Open', 'Crash', 'High']));
    // A canvas per column, and the track's icon beside its name
    expect(panel.root.findAllByType(ScoreCanvas)).toHaveLength(5);
    const icons = panel.root.findAll((node) => typeof node.props.icon === 'string' && typeof node.props.size === 'number');
    expect([...new Set(icons.map((icon) => icon.props.icon))]).toEqual(['drums']);
  });

  it('shows the whole kit when asked, and switches with its buttons', () => {
    // Arrange
    const drumKey = drumKeyOf({ showsWholeKit: true });

    // Act
    const panel = render(1, drumKey);
    ReactTestRenderer.act(() => panel.button('Used drums')?.props.onPress());

    // Assert
    expect(panel.columns().flatMap(([, keys]) => keys as number[])).toHaveLength(WHOLE_KIT_KEYS.length);
    expect(panel.button('Whole kit')?.props.isActive).toBe(true);
    expect(drumKey.setShowsWholeKit).toHaveBeenCalledWith(false);
  });

  it('gives a drum’s full name and key while the mouse is over it', () => {
    // Arrange
    const panel = render(1);
    const open = panel.root.findAll((node) => node.props.testID === 'drum-key-46' && typeof node.props.onHoverIn === 'function')[0]!;

    // Act
    ReactTestRenderer.act(() => open.props.onHoverIn());

    // Assert
    expect(panel.texts()).toContain('Hi-Hat · Open — General MIDI key 46: Open Hi-Hat');
    expect(open.props.tooltip).toBe('Hi-Hat · Open\nGeneral MIDI key 46: Open Hi-Hat');
    ReactTestRenderer.act(() => open.props.onHoverOut());
    expect(panel.texts()).toContain('Point at a drum for its full name and key.');
  });

  it('waits for its room to be measured, then fits its rows in it', () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DrumKeyPanel palette={PALETTE} song={SONG} trackIndex={1} drumKey={drumKeyOf({ showsWholeKit: true })} />);
    });
    const card = () => renderer.root.findAll((node) => node.props.testID === 'drum-key-panel');
    const room = renderer.root.findAll((node) => node.props.pointerEvents === 'box-none')[0]!;

    // Act / Assert
    expect(card()).toHaveLength(0);
    ReactTestRenderer.act(() => room.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 600, height: 500 } } }));
    const width = StyleSheet.flatten(card()[0]!.props.style).width;
    expect(width).toBeLessThanOrEqual(600);
  });

  it('says what it is for on a track that is not a drum track, its buttons off', () => {
    const panel = render(0);

    expect(panel.texts()).toContain('The drum key shows how a drum track is written. Put the cursor on a drum track.');
    expect(panel.columns()).toEqual([]);
    expect(panel.button('Whole kit')?.props.isEnabled).toBe(false);
  });

  it('closes with its ×', () => {
    const drumKey = drumKeyOf();
    const panel = render(1, drumKey);

    ReactTestRenderer.act(() => panel.button('✕')?.props.onPress());

    expect(drumKey.close).toHaveBeenCalled();
  });
});
