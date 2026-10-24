import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BEND_PRESETS, type Song, type StringAddress } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { EditionPalette } from '../src/components/palette/EditionPalette';
import { paletteGroups } from '../src/components/palette/palette-groups';
import { voiceTint } from '../src/score/voices';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: a quarter note on string 2 (fret 5, palm muted, a half bend, played p). */
const SONG: Song = makeSong([[beat(960, [{ ...note(2, 5, { palmMute: true, bend: BEND_PRESETS.half }), velocity: 47 }])]]);
const ON_NOTE: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };
const ON_EMPTY_STRING: StringAddress = { ...ON_NOTE, string: 4 };

/** `null`: no cursor. */
function render(cursor: StringAddress | null = ON_NOTE, song: Song = SONG, isMultivoice = false) {
  const onEdit = jest.fn();
  const onAction = jest.fn();
  const onOpenPanel = jest.fn();
  const onOpenChordPanel = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <EditionPalette palette={PALETTE} song={song} cursor={cursor ?? undefined} isMultivoice={isMultivoice} onEdit={onEdit} onAction={onAction} onOpenPanel={onOpenPanel} onOpenChordPanel={onOpenChordPanel} />,
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
  const groupTitles = new Set(paletteGroups().map((group) => group.title.toUpperCase()));
  const titles = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join('')).filter((text) => groupTitles.has(text));
  return { renderer, onEdit, onAction, onOpenPanel, onOpenChordPanel, tool, byLabel, press, pressLabel, pressTooltip, titles };
}

describe('EditionPalette layout', () => {
  it('puts the note’s techniques right under the rhythm, where they show without scrolling', () => {
    expect(render().titles()).toEqual(['VOICE', 'RHYTHM', 'TECHNIQUES', 'ARTICULATION', 'DYNAMICS', 'NOTE', 'BEAT', 'BAR']);
    expect(paletteGroups().flatMap((group) => group.tools).length).toBeGreaterThan(45);
  });

  it('keeps every guitar technique in the techniques group, each with its key', () => {
    // Act
    const techniques = paletteGroups().find((group) => group.title === 'Techniques')?.tools ?? [];

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
    expect(paletteGroups().flatMap((group) => group.tools).every((tool) => tool.tooltip.length > 0)).toBe(true);
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
    palette.press('voice4');
    expect(palette.onAction.mock.calls.map(([action]) => action)).toEqual([
      { type: 'shiftNoteFret', delta: 1 },
      { type: 'selectVoice', voiceIndex: 1 },
      { type: 'selectVoice', voiceIndex: 3 },
    ]);
  });

  it('offers voices 1 to 4 in one row, each in its voice’s colour, with its key in the tooltip', () => {
    // Arrange / Act
    const voices = paletteGroups().find((group) => group.title === 'Voice')?.tools.slice(0, 4) ?? [];
    const palette = render();

    // Assert
    expect(voices.map((tool) => tool.face)).toEqual(['1', '2', '3', '4']);
    expect(voices.map((tool) => tool.tooltip)).toEqual([
      'Voice 1: edit the first voice of the bar (⌘1)',
      'Voice 2: edit the second voice of the bar (⌘2)',
      'Voice 3: edit the third voice of the bar (⌘3)',
      'Voice 4: edit the fourth voice of the bar (⌘4)',
    ]);
    expect(voices.map((tool) => tool.tint?.(PALETTE))).toEqual([0, 1, 2, 3].map((index) => voiceTint(index, PALETTE)));
    expect(palette.tool('voice3').findAllByProps({ testID: 'palette-voice3-tint' })).not.toHaveLength(0);
  });

  it('moves the note to another voice from the ⇄ tool’s options', () => {
    // Arrange
    const palette = render();

    // Act
    palette.press('moveVoice');
    palette.pressTooltip('Move the note (or the selected beats) to voice 3 (⌥3)');

    // Assert
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'moveToVoice', voiceIndex: 2 });
  });

  it('turns multivoice on and off, lit while it is on', () => {
    expect(render().tool('multivoice').props.isActive).toBe(false);
    const palette = render(ON_NOTE, SONG, true);
    expect(palette.tool('multivoice').props.isActive).toBe(true);
    palette.press('multivoice');
    expect(palette.onAction).toHaveBeenCalledWith({ type: 'toggleMultivoice' });
  });

  it('keeps the Voice group on one row: four voices, ⇄ and multivoice', () => {
    const group = paletteGroups().find((candidate) => candidate.title === 'Voice');
    expect(group?.tools.map((tool) => tool.id)).toEqual(['voice1', 'voice2', 'voice3', 'voice4', 'moveVoice', 'multivoice']);
    expect((group?.toolWidth ?? 0) * 6 + 2 * 6).toBeLessThanOrEqual(198);
  });

  it('lights the cursor’s voice and keeps the beat’s tools on in voice 3 of a beat read with one voice slot', () => {
    // Act
    const palette = render({ ...ON_NOTE, voiceIndex: 2 });

    // Assert
    expect(palette.tool('voice3').props.isActive).toBe(true);
    expect(palette.tool('voice1').props.isActive).toBe(false);
    expect(palette.tool('voice4').props.isEnabled).toBe(true);
    expect(palette.tool('value8').props.isEnabled).toBe(true);
    expect(palette.tool('palmMute').props.isEnabled).toBe(false);
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
    // The Voice group's third button is labelled 3 too.
    palette.pressTooltip('3-tuplet inside the beat’s tuplet');

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
