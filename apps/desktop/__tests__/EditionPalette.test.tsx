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
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={song} cursor={cursor ?? undefined} onEdit={onEdit} onAction={onAction} />);
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
  return { renderer, onEdit, onAction, tool, byLabel, press, pressLabel, pressTooltip, titles };
}

describe('EditionPalette layout', () => {
  it('shows Guitar Pro’s groups top to bottom', () => {
    expect(render().titles()).toEqual(['VOICE', 'BAR', 'RHYTHM', 'NOTE', 'DYNAMICS', 'ARTICULATION', 'EFFECTS', 'BEAT']);
    expect(PALETTE_GROUPS.flatMap((group) => group.tools).length).toBeGreaterThan(45);
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
    palette.press('bend');
    const half = palette.byLabel('Bend ½')?.props.isActive;
    palette.pressLabel('Pre-bend');

    // Assert
    expect(half).toBe(true);
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'setBend', preset: 'preBend' });
    expect(palette.byLabel('Pre-bend')).toBeUndefined();
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

  it('steps the bar’s tempo, and only steps repeats on a bar that closes a repeat', () => {
    const palette = render();
    palette.pressTooltip('Written tempo from this bar (5 BPM steps): more');
    expect(palette.onEdit).toHaveBeenCalledWith({ type: 'shiftTempo', delta: 5 });
    const repeats = palette.renderer.root.findAllByType(ChromeButton).find((button) => button.props.tooltip === 'Times the repeat is played: more');
    expect(repeats?.props.isEnabled).toBe(false);
  });
});
