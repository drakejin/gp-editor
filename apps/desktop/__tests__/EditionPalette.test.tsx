import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BEND_PRESETS, type Song, type StringAddress } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { EditionPalette } from '../src/components/palette/EditionPalette';
import { PALETTE_GROUPS } from '../src/components/palette/palette-groups';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: a quarter note on string 2 (fret 5, palm muted, a half bend, played p). */
const SONG: Song = makeSong([[beat(960, [{ ...note(2, 5, { palmMute: true, bend: BEND_PRESETS.half }), velocity: 47 }])]]);
const ON_NOTE: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };
const ON_EMPTY_STRING: StringAddress = { ...ON_NOTE, string: 4 };

/** `null`: no cursor. */
function render(cursor: StringAddress | null = ON_NOTE, song: Song = SONG) {
  const onEdit = jest.fn();
  const onAction = jest.fn();
  const onOpenPanel = jest.fn();
  const onOpenChordPanel = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <EditionPalette palette={PALETTE} song={song} cursor={cursor ?? undefined} onEdit={onEdit} onAction={onAction} onOpenPanel={onOpenPanel} onOpenChordPanel={onOpenChordPanel} />,
    );
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const tool = (id: string) => {
    const found = buttons().find((button) => button.props.testID === `palette-${id}`);
    if (found === undefined) {
      throw new Error(`no tool ${id}`);
    }
    return found;
  };
  const byLabel = (label: string) => buttons().find((button) => button.props.label === label);
  const press = (id: string) => ReactTestRenderer.act(() => tool(id).props.onPress());
  const pressLabel = (label: string) => ReactTestRenderer.act(() => byLabel(label)?.props.onPress());
  const pressTooltip = (tooltip: string) => ReactTestRenderer.act(() => buttons().find((button) => button.props.tooltip === tooltip)?.props.onPress());
  const groupTitles = new Set(PALETTE_GROUPS.map((group) => group.title.toUpperCase()));
  const titles = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join('')).filter((text) => groupTitles.has(text));
  return { renderer, onEdit, onAction, onOpenPanel, onOpenChordPanel, tool, byLabel, press, pressLabel, pressTooltip, titles };
}

describe('EditionPalette layout', () => {
  it('puts the note’s techniques right under the rhythm, where they show without scrolling', () => {
    expect(render().titles()).toEqual(['VOICE', 'RHYTHM', 'TECHNIQUES', 'ARTICULATION', 'DYNAMICS', 'NOTE', 'BEAT', 'BAR']);
    expect(PALETTE_GROUPS.flatMap((group) => group.tools).length).toBeGreaterThan(45);
  });

  it('keeps every guitar technique in the techniques group, each with its key', () => {
    // Act
    const techniques = PALETTE_GROUPS.find((group) => group.title === 'Techniques')?.tools ?? [];

    // Assert
    expect(techniques.map((tool) => [tool.id, tool.key])).toEqual(
      expect.arrayContaining([
        ['bend', 'C'],
        ['slide', 'S'],
        ['hammer', 'H'],
        ['harmonic', 'N'],
        ['palmMute', 'M'],
        ['letRing', 'R'],
        ['dead', 'X'],
        ['vibrato', 'B'],
        ['ghost', 'G'],
      ]),
    );
  });

  it('shows a tool’s key on its button', () => {
    const palette = render();
    const texts = palette.tool('palmMute').findAllByType(Text).map((text) => text.props.children);
    expect(texts).toEqual(['P.M.', 'M']);
  });

  it('gives every tool a tooltip and draws music symbols as Bravura glyphs on the score canvas', () => {
    const palette = render();
    expect(palette.tool('value4').props.icon.props).toMatchObject({ glyph: '\uE1D5', kind: 'note' });
    expect(PALETTE_GROUPS.flatMap((group) => group.tools).every((tool) => tool.tooltip.length > 0)).toBe(true);
  });
});

describe('EditionPalette state at the cursor', () => {
  it('lights what the note, beat and bar have', () => {
    // Act
    const palette = render();

    // Assert
    expect(palette.tool('palmMute').props.isActive).toBe(true);
    expect(palette.tool('letRing').props.isActive).toBe(false);
    expect(palette.tool('bend').props.isActive).toBe(true);
    expect(palette.tool('value4').props.isActive).toBe(true);
    expect(palette.tool('dynamic-p').props.isActive).toBe(true);
    expect(palette.tool('voice1').props.isActive).toBe(true);
  });

  it('disables note tools on an empty string but keeps beat and bar tools', () => {
    const palette = render(ON_EMPTY_STRING);
    expect(palette.tool('palmMute').props.isEnabled).toBe(false);
    expect(palette.tool('dynamic-f').props.isEnabled).toBe(false);
    expect(palette.tool('value8').props.isEnabled).toBe(true);
    expect(palette.tool('repeatOpen').props.isEnabled).toBe(true);
  });

  it('disables everything without a cursor', () => {
    const palette = render(null);
    expect(palette.tool('value8').props.isEnabled).toBe(false);
    expect(palette.tool('insertMeasure').props.isEnabled).toBe(false);
  });
});

describe('EditionPalette edits', () => {
  it('sends a duration, an effect, a dynamic and a stroke as edits at the cursor', () => {
    // Arrange
    const palette = render();

    // Act
    palette.press('value8');
    palette.press('letRing');
    palette.press('dynamic-ff');
    palette.press('pickDown');

    // Assert
    expect(palette.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
      { type: 'setNoteValue', value: 8 },
      { type: 'toggleEffect', effect: 'letRing' },
      { type: 'setDynamic', dynamic: 'ff' },
      { type: 'setPickStroke', direction: 'down' },
    ]);
  });

  it('sends cursor actions for the note tools and the voices', () => {
    const palette = render();
    palette.press('fretUp');
    palette.press('voice2');
    expect(palette.onAction.mock.calls.map(([action]) => action)).toEqual([{ type: 'shiftNoteFret', delta: 1 }, { type: 'selectVoice', voiceIndex: 1 }]);
  });

  it('opens a tool’s options under its group, lights the current one, and applies a choice', () => {
    // Arrange
    const palette = render();

    // Act
    palette.press('harmonic');
    const none = palette.byLabel('None')?.props.isActive;
    palette.pressLabel('P.H.');

    // Assert
    expect(none).toBe(true);
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'setHarmonic', harmonic: 'pinch' });
    expect(palette.byLabel('P.H.')).toBeUndefined();
  });

  it('opens the bend and vibrato panels, as C and B do, and lights a bent note’s bend', () => {
    // Arrange
    const palette = render();

    // Act
    palette.press('bend');
    palette.press('vibrato');

    // Assert
    expect(palette.tool('bend').props.isActive).toBe(true);
    expect(palette.onOpenPanel.mock.calls).toEqual([['bend'], ['vibrato']]);
    expect(palette.onEdit).not.toHaveBeenCalled();
  });

  it('opens the chord diagram panel, as K does, lit on a beat with a chord', () => {
    // Arrange
    const [first] = SONG.tracks[0]!.measures[0]!.beats;
    const chorded = makeSong([[{ ...first!, chord: { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] } }]]);
    const plain = render();
    const lit = render(ON_NOTE, chorded);

    // Act
    plain.press('chord');

    // Assert
    expect(plain.onOpenChordPanel).toHaveBeenCalledTimes(1);
    expect(plain.tool('chord').props.isActive).toBe(false);
    expect(lit.tool('chord').props.isActive).toBe(true);
    expect(plain.onEdit).not.toHaveBeenCalled();
  });

  it('offers every tuplet Guitar Pro stores, and a tuplet inside the beat’s tuplet', () => {
    // Arrange
    const palette = render();
    const labels = () => palette.renderer.root.findAllByType(ChromeButton).map((button) => button.props.label);

    // Act
    palette.press('tuplet');
    const sizes = labels();
    palette.press('innerTuplet');
    palette.pressLabel('3');

    // Assert
    expect(sizes).toEqual(expect.arrayContaining(['None', '3', '5', '6', '7', '9', '10', '11', '12']));
    expect(palette.tool('innerTuplet').props.tooltip).toContain('⌥/');
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'setInnerTuplet', enters: 3 });
  });

  it('closes an open option strip when its tool is pressed again', () => {
    const palette = render();
    palette.press('harmonic');
    expect(palette.byLabel('P.H.')).toBeDefined();
    palette.press('harmonic');
    expect(palette.byLabel('P.H.')).toBeUndefined();
  });

  it('names a section in a text field', () => {
    // Arrange
    const palette = render();
    palette.press('section');
    const field = () => palette.renderer.root.findByType(TextInput);

    // Act
    ReactTestRenderer.act(() => field().props.onChangeText('Chorus 1'));
    ReactTestRenderer.act(() => field().props.onSubmitEditing());

    // Assert
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'setSection', title: 'Chorus 1' });
  });

  it('types the bar’s tempo with decimals: a click on the tempo opens a field', () => {
    // Arrange
    const palette = render();
    const value = palette.renderer.root.findByProps({ testID: 'palette-value-tempo' });
    ReactTestRenderer.act(() => value.props.onPress());
    const field = () => palette.renderer.root.findByType(TextInput);

    // Act
    const initial = field().props.value;
    ReactTestRenderer.act(() => field().props.onChangeText('92,5'));
    ReactTestRenderer.act(() => field().props.onSubmitEditing());

    // Assert
    expect(initial).toBe('120');
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'setTempo', tempo: 92.5 });
    expect(palette.renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('steps the bar’s tempo, and only steps repeats on a bar that closes a repeat', () => {
    const palette = render();
    palette.pressTooltip('Written tempo from this bar (5 BPM steps): more');
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'shiftTempo', delta: 5 });
    const repeats = palette.renderer.root.findAllByType(ChromeButton).find((button) => button.props.tooltip === 'Times the repeat is played: more');
    expect(repeats?.props.isEnabled).toBe(false);
  });
});
