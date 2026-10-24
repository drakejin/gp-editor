import { PALETTE_GROUPS } from '../src/components/palette/palette-groups';
import {
  clefTool,
  expressionTextTool,
  ottavaTool,
} from '../src/components/palette/palette-expression';
import {
  type PaletteContext,
  type PaletteTool,
  paletteContext,
} from '../src/components/palette/palette-tools';
import { PALETTE_COMMANDS } from '../src/lib/palette-commands';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1 in the treble clef, bar 2 in the bass clef under an 8vb; the cursor on `measureIndex`'s first beat. */
function context(measureIndex: number): PaletteContext {
  const song = makeSong([
    [beat(960, [note(1, 5)])],
    [{ ...beat(4800, [note(6, 0)]), ottava: '8vb' }],
  ]);
  const track = song.tracks[0]!;
  const clefs = {
    ...song,
    tracks: [
      {
        ...track,
        measures: track.measures.map((measure, index) => ({
          ...measure,
          clef: index === 1 ? ('bass' as const) : measure.clef,
        })),
      },
    ],
  };
  return paletteContext(clefs, {
    trackIndex: 0,
    measureIndex,
    beatIndex: 0,
    voiceIndex: 0,
    string: 1,
  });
}

const options = (tool: PaletteTool) =>
  tool.run.kind === 'options' ? tool.run.options : [];
const toolIds = (title: string) =>
  PALETTE_GROUPS.find(group => group.title === title)?.tools.map(
    tool => tool.id,
  ) ?? [];

describe('palette: Expression Text, octave signs and clefs', () => {
  it('puts Expression Text after the beat’s text, the octave sign at the end of the Beat group and the clef in the Bar group', () => {
    expect(toolIds('Beat').slice(4, 7)).toEqual([
      'text',
      'expressionText',
      'chord',
    ]);
    expect(toolIds('Beat').at(-1)).toBe('ottava');
    expect(toolIds('Bar')).toContain('clef');
  });

  it('opens Expression Text from its button, named with its key in the tooltip', () => {
    expect(expressionTextTool()).toMatchObject({
      id: 'expressionText',
      face: '>',
      run: { kind: 'expressionText' },
    });
    expect(expressionTextTool().tooltip).toContain('⌥⌘E');
  });

  it('offers no sign and the four octave signs, lit as the cursor’s beat has them', () => {
    // Arrange
    const signed = context(1);
    const plain = context(0);

    // Act
    const tool = ottavaTool();
    const lit = options(tool)
      .filter(option => option.isActive?.(signed))
      .map(option => option.label);

    // Assert
    expect(options(tool).map(option => option.label)).toEqual([
      'None',
      '8va',
      '8vb',
      '15ma',
      '15mb',
    ]);
    expect(options(tool).map(option => option.edit)).toContainEqual({
      type: 'setOttava',
      ottava: 'none',
    });
    expect([tool.isActive?.(signed), tool.isActive?.(plain)]).toEqual([
      true,
      false,
    ]);
    expect(lit).toEqual(['8vb']);
  });

  it('offers the four clefs, the bar’s own lit, and lights the tool where the clef changes', () => {
    // Arrange
    const tool = clefTool();
    const litIn = (c: PaletteContext) =>
      options(tool)
        .filter(option => option.isActive?.(c))
        .map(option => option.label);

    // Act / Assert
    expect(options(tool).map(option => option.edit)).toEqual(
      ['treble', 'bass', 'alto', 'tenor'].map(clef => ({
        type: 'setClef',
        clef,
      })),
    );
    expect([litIn(context(0)), litIn(context(1))]).toEqual([
      ['Treble'],
      ['Bass'],
    ]);
    expect([tool.isActive?.(context(0)), tool.isActive?.(context(1))]).toEqual([
      false,
      true,
    ]);
  });

  it('lists the octave signs and clefs in the command palette, but not the Expression Text button (Tools has it)', () => {
    const ids = PALETTE_COMMANDS.map(command => command.id);
    expect(
      ids.filter(
        id =>
          id.startsWith('palette.ottava.') || id.startsWith('palette.clef.'),
      ),
    ).toHaveLength(9);
    expect(ids.some(id => id.startsWith('palette.expressionText'))).toBe(false);
  });
});
