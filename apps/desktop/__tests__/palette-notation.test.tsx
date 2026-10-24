import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QUARTER, type Song, type StringAddress } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { EditionPalette, PALETTE_ROW_HEIGHT } from '../src/components/palette/EditionPalette';
import { paletteGroups } from '../src/components/palette/palette-groups';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const EIGHTH = { ...QUARTER, value: 8 as const };
/** Bar 1 (beamed by halves): an eighth on string 2 with fingers, slashed, its beam joined to the next; then plain beats. */
const SONG: Song = (() => {
  const song = makeSong(
    [[beat(960, [{ ...note(2, 5), leftFinger: 'middle', rightFinger: 'index', accidentalDisplay: 'cautionary' }], EIGHTH), beat(1440, [note(2, 7)], EIGHTH)]],
    [header(1, { beamGrouping: { unit: 8, groups: [4, 4] } })],
  );
  const [track] = song.tracks;
  const measure = track!.measures[0]!;
  const [first, ...rest] = measure.beats;
  const marked = { ...first!, voices: first!.voices.map((voice, i) => (i === 0 ? { ...voice, isSlashed: true, beamToNext: 'join' as const } : voice)) };
  return { ...song, tracks: [{ ...track!, measures: [{ ...measure, beats: [marked, ...rest] }] }] };
})();
const ON_NOTE: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };
const ON_PLAIN_NOTE: StringAddress = { ...ON_NOTE, beatIndex: 1 };

function render(cursor: StringAddress) {
  const onEdit = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={SONG} cursor={cursor} onEdit={onEdit} onAction={jest.fn()} onOpenPanel={jest.fn()} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const tool = (id: string) => buttons().find((button) => button.props.testID === `palette-${id}`);
  const press = (id: string) => ReactTestRenderer.act(() => tool(id)?.props.onPress());
  const option = (tooltip: string) => buttons().find((button) => button.props.tooltip === tooltip);
  const choose = (tooltip: string) => ReactTestRenderer.act(() => option(tooltip)?.props.onPress());
  return { onEdit, tool, press, option, choose };
}

const MARK_TOOLS = ['leftFinger', 'rightFinger', 'pianoFinger', 'accidental', 'slash', 'breakBeam', 'joinBeam', 'breakSecondaryBeam', 'beamGrouping'];

describe('edition palette: notation marks', () => {
  it('has a visible button with a tooltip for every mark, at the end of the Note, Beat and Bar groups', () => {
    // Act
    const palette = render(ON_NOTE);

    // Assert
    expect(MARK_TOOLS.filter((id) => palette.tool(id) === undefined)).toEqual([]);
    expect(MARK_TOOLS.every((id) => (palette.tool(id)?.props.tooltip ?? '').length > 10)).toBe(true);
    const groupOf = (id: string) => paletteGroups().find((group) => group.tools.some((tool) => tool.id === id))?.title;
    expect(MARK_TOOLS.map(groupOf)).toEqual(['Note', 'Note', 'Note', 'Note', 'Beat', 'Beat', 'Beat', 'Beat', 'Bar']);
  });

  it('lights the marks the note, beat and bar have', () => {
    // Act
    const marked = render(ON_NOTE);
    const plain = render(ON_PLAIN_NOTE);

    // Assert
    const lit = (palette: ReturnType<typeof render>) => MARK_TOOLS.filter((id) => palette.tool(id)?.props.isActive === true);
    expect(lit(marked)).toEqual(['leftFinger', 'rightFinger', 'pianoFinger', 'accidental', 'slash', 'joinBeam', 'beamGrouping']);
    expect(lit(plain)).toEqual(['beamGrouping']);
  });

  it('offers T 1 2 3 4 for the left hand, p i m a c for the right, 1–5 for the piano, and sends the choice', () => {
    // Arrange
    const palette = render(ON_PLAIN_NOTE);

    // Act
    palette.press('leftFinger');
    const label = palette.option('Left-hand finger: Ring finger (3)')?.props.label;
    palette.choose('Left-hand finger: Ring finger (3)');
    palette.press('rightFinger');
    palette.choose('Right-hand finger: Thumb (p)');
    palette.press('pianoFinger');
    palette.choose('Piano finger: Little finger (5)');

    // Assert
    expect(label).toBe('3');
    expect(palette.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
      { type: 'setFinger', hand: 'left', finger: 'annular' },
      { type: 'setFinger', hand: 'right', finger: 'thumb' },
      { type: 'setPianoFinger', finger: 'little' },
    ]);
  });

  it('sends the accidental, slash, beams and beam grouping', () => {
    // Arrange
    const palette = render(ON_PLAIN_NOTE);

    // Act
    palette.press('accidental');
    palette.choose('Forced accidental: always written');
    palette.press('slash');
    palette.press('breakBeam');
    palette.press('breakSecondaryBeam');
    palette.press('beamGrouping');
    palette.choose('One beam over the whole bar');

    // Assert
    expect(palette.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
      { type: 'setAccidentalDisplay', display: 'forced' },
      { type: 'toggleSlash' },
      { type: 'toggleBeamLink', link: 'break' },
      { type: 'toggleBeamLink', link: 'breakSecondary' },
      { type: 'setBeamGrouping', preset: 'byBar' },
    ]);
  });

  it('lights the bar’s grouping among the presets', () => {
    // Arrange
    const palette = render(ON_NOTE);

    // Act
    palette.press('beamGrouping');

    // Assert
    expect(palette.option('Beams over two beats')?.props.isActive).toBe(true);
    expect(palette.option('One beam over the whole bar')?.props.isActive).toBe(false);
  });
});

describe('edition palette: compact rows', () => {
  it('draws every tool and stepper button in the compact row height, so all groups fit the default window', () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={SONG} cursor={ON_NOTE} onEdit={jest.fn()} onAction={jest.fn()} onOpenPanel={jest.fn()} />);
    });

    // Act
    const heights = new Set(renderer.root.findAllByType(ChromeButton).map((button) => button.props.height));

    // Assert
    expect([...heights]).toEqual([PALETTE_ROW_HEIGHT]);
  });

  it('puts the time signature’s two numbers on one row under one label, so the Bar group takes a row fewer', () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={SONG} cursor={ON_NOTE} onEdit={jest.fn()} onAction={jest.fn()} onOpenPanel={jest.fn()} />);
    });
    // The texts and button tooltips of the row holding a button (plain strings: a test instance does not print).
    const rowOf = (tooltip: string) => {
      let node = renderer.root.findAllByType(ChromeButton).find((button) => button.props.tooltip === tooltip)?.parent ?? null;
      while (node !== null && node.type !== View) {
        node = node.parent;
      }
      return {
        texts: (node?.findAllByType(Text) ?? []).map((text) => String(text.props.children)),
        tooltips: (node?.findAllByType(ChromeButton) ?? []).map((button) => String(button.props.tooltip)),
      };
    };

    // Act
    const row = rowOf('Time signature: beats per bar: less');

    // Assert
    expect(row.tooltips).toEqual([
      'Time signature: beats per bar: less',
      'Time signature: beats per bar: more',
      'Time signature: the beat’s note value: less',
      'Time signature: the beat’s note value: more',
    ]);
    expect(row.texts).toEqual(['Time', '−', '4', '+', '−', '÷4', '+']);
  });
});

