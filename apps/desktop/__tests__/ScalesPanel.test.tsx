import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SCALES, SCALE_ROOTS, type ScaleChoice, type Song, scaleIndexNamed } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { ScaleListRow } from '../src/components/scales/ScaleList';
import { ScalesPanel, type ScalesPanelProps } from '../src/components/scales/ScalesPanel';
import { ScoreCanvas } from '../src/native/score-canvas';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** The native canvas becomes a plain host element, so the diagram's commands can be read. */
jest.mock('../src/native/score-canvas', () => ({
  ScoreCanvas: 'MockScoreCanvas',
}));

const root = (name: string): number => SCALE_ROOTS.findIndex((candidate) => candidate.name === name);
const A_MINOR_PENTATONIC: ScaleChoice = { rootIndex: root('A'), scaleIndex: scaleIndexNamed('Pentatonic Minor Scale') ?? -1 };

/** An A minor pentatonic lick in bar 1: A C D E G A. */
const LICK: Song = makeSong([[beat(960, [note(3, 2)]), beat(1440, [note(2, 1)]), beat(1920, [note(2, 3)]), beat(2400, [note(1, 0)]), beat(2880, [note(1, 3)]), beat(3360, [note(1, 5)])]]);

function render(overrides: Partial<ScalesPanelProps> = {}) {
  const props: ScalesPanelProps = {
    palette: PALETTE,
    song: LICK,
    trackIndex: 0,
    cursorMeasureIndex: 0,
    onChoose: jest.fn(),
    onClear: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ScalesPanel {...props} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((found) => found.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const rows = () => renderer.root.findAllByType(ScaleListRow);
  const pressRow = (label: string) => ReactTestRenderer.act(() => rows().find((row) => row.props.label === label)?.props.onPress());
  const search = () => renderer.root.findAllByType(TextInput).find((found) => found.props.accessibilityLabel === 'Search scales');
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const update = (next: Partial<ScalesPanelProps>) => ReactTestRenderer.act(() => renderer.update(<ScalesPanel {...props} {...next} />));
  return { props, renderer, button, press, rows, pressRow, search, texts, update };
}

describe('ScalesPanel', () => {
  it('lists TuxGuitar’s scales; a search narrows them and a click chooses one on the root picked', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Root: A');
    ReactTestRenderer.act(() => panel.search()?.props.onChangeText('minor penta'));
    panel.pressRow('Pentatonic Minor Scale');

    // Assert
    expect(panel.rows().map((row) => row.props.label)).toEqual(['Pentatonic Minor Scale', 'Pentatonic Minor Mode']);
    expect(panel.props.onChoose).toHaveBeenCalledWith(A_MINOR_PENTATONIC);
  });

  it('shows every scale before a search', () => {
    expect(render().rows()).toHaveLength(SCALES.length);
  });

  it('moves the chosen scale to another root', () => {
    const panel = render({ choice: A_MINOR_PENTATONIC });
    panel.press('Root: E');
    expect(panel.props.onChoose).toHaveBeenCalledWith({ rootIndex: root('E'), scaleIndex: A_MINOR_PENTATONIC.scaleIndex });
  });

  it('finds the scales that hold the selection’s notes, best first, and chooses one', () => {
    // Arrange
    const panel = render({ selection: { first: { measureIndex: 0, beatIndex: 0 }, last: { measureIndex: 0, beatIndex: 5 } } });

    // Act
    panel.press('Find the scales that hold the selected notes');
    const first = panel.rows()[0];
    ReactTestRenderer.act(() => first?.props.onPress());

    // Assert
    expect(panel.texts()).toContain('6 notes in the selection: C D E G A');
    expect(first?.props.label).toBe('A Pentatonic Minor Scale');
    expect(panel.props.onChoose).toHaveBeenCalledWith(A_MINOR_PENTATONIC);
    panel.press('Back to every scale');
    expect(panel.rows()).toHaveLength(SCALES.length);
  });

  it('finds from the cursor’s bar without a selection, and from the whole track', () => {
    const panel = render();
    expect(panel.button('Find the scales that hold the notes of bar 1')).toBeDefined();
    panel.press('Find the scales that hold every note of the track');
    expect(panel.texts()).toContain('6 notes in the track: C D E G A');
  });

  it('spells the chosen scale’s notes and draws its boxes, one position at a time', () => {
    // Arrange
    const panel = render({ choice: A_MINOR_PENTATONIC });

    // Act
    panel.press('Next position');

    // Assert
    expect(panel.texts()).toContain('A C D E G');
    expect(panel.texts()).toContain('Position 2 of 5 · frets 7–11');
    expect(panel.renderer.root.findAllByType(ScoreCanvas)).toHaveLength(1);
    panel.press('Previous position');
    expect(panel.texts()).toContain('Position 1 of 5 · frets 4–8');
  });

  it('says why a drum track has no diagram', () => {
    const drums: Song = { ...LICK, tracks: LICK.tracks.map((track) => ({ ...track, isPercussion: true })) };
    const panel = render({ song: drums, choice: A_MINOR_PENTATONIC });
    expect(panel.renderer.root.findAllByType(ScoreCanvas)).toHaveLength(0);
    expect(panel.texts()).toContain('Boxes need a pitched track of 3 to 10 strings.');
  });

  it('clears the marks and closes', () => {
    const panel = render({ choice: A_MINOR_PENTATONIC });
    panel.press('Clear the scale from the keyboard and the fretboard');
    panel.press('Close the Scales panel');
    expect(panel.props.onClear).toHaveBeenCalledTimes(1);
    expect(panel.props.onClose).toHaveBeenCalledTimes(1);
    expect(render().button('Clear the scale from the keyboard and the fretboard')?.props.isEnabled).toBe(false);
  });
});
