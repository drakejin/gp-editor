import { QUARTER_TIME } from '@gp-editor/core';
import { PALETTE_GROUPS } from '../src/components/palette/palette-groups';
import { directionsTool, fadeTools, hairpinTools, pedalTools, rasgueadoTool } from '../src/components/palette/palette-marks';
import { type PaletteContext, type PaletteTool, paletteContext } from '../src/components/palette/palette-tools';
import { beat, header, makeSong, note } from '../test-support/songs';

/** Bar 1: a crescendo quarter note with fade out and a rasgueado, the pedal pressed under it and released after it. */
function context(): PaletteContext {
  const marked = { ...beat(960, [note(1, 5, { fadeOut: true })]), hairpin: 'crescendo' as const, rasgueado: 'pmpTriplet' as const };
  const song = makeSong([[marked, beat(1920, [note(1, 7)])]], [header(1, { directions: ['segno', 'daCoda'] })]);
  const pedals = [{ offset: 0, action: 'down' as const }, { offset: QUARTER_TIME, action: 'up' as const }];
  const track = song.tracks[0]!;
  const pedalled = { ...song, tracks: [{ ...track, measures: [{ ...track.measures[0]!, pedals }] }] };
  return paletteContext(pedalled, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
}

const toolIn = (title: string, id: string): PaletteTool | undefined => PALETTE_GROUPS.find((group) => group.title === title)?.tools.find((tool) => tool.id === id);
const options = (tool: PaletteTool) => (tool.run.kind === 'options' ? tool.run.options : []);

describe('palette: notation marks', () => {
  it('puts each mark at the end of its group', () => {
    expect([toolIn('Bar', 'directions'), toolIn('Dynamics', 'crescendo'), toolIn('Dynamics', 'decrescendo'), toolIn('Techniques', 'fadeOut'), toolIn('Techniques', 'volumeSwell')]).not.toContain(undefined);
    // The Beat group ends with the rasgueado and pedal tools, then the slash and beam tools (palette-notation.ts) and
    // the octave sign (palette-expression.ts).
    const beatTools = PALETTE_GROUPS.find((group) => group.title === 'Beat')?.tools.map((tool) => tool.id) ?? [];
    expect(beatTools.slice(-8, -1)).toEqual(['rasgueado', 'pedalDown', 'pedalUp', 'slash', 'breakBeam', 'joinBeam', 'breakSecondaryBeam']);
  });

  it('lights the marks the cursor’s note, beat and bar have', () => {
    // Arrange
    const c = context();
    const lit = (tool: PaletteTool) => tool.isActive?.(c) ?? false;

    // Act / Assert
    expect([directionsTool(), ...hairpinTools(), ...fadeTools(), rasgueadoTool(), ...pedalTools()].map(lit)).toEqual([true, true, false, true, false, true, true, true]);
    expect(options(directionsTool()).filter((option) => option.isActive?.(c)).map((option) => option.label)).toEqual(['Segno', 'Da Coda']);
    expect(options(rasgueadoTool()).filter((option) => option.isActive?.(c)).map((option) => option.label)).toEqual(['pmp³']);
  });

  it('offers the 19 directions and Guitar Pro’s 18 rasgueado patterns, each with a tooltip', () => {
    // Act
    const directions = options(directionsTool());
    const patterns = options(rasgueadoTool());

    // Assert
    expect(directions).toHaveLength(19);
    expect(directions.find((option) => option.label === 'D.S. al Coda')?.tooltip).toBe('D.S. al Coda: back to the segno, then from the Da Coda on to the coda');
    expect(directions.find((option) => option.label === 'D.C.')?.tooltip).toBe('D.C.: back to the start, then on to the end');
    expect(patterns).toHaveLength(19);
    expect(patterns.find((option) => option.label === 'mii an.')?.tooltip).toBe('Rasgueado m-i-i, anapaest (short, short, long)');
    expect([...directions, ...patterns].every((option) => option.tooltip.length > 0)).toBe(true);
  });

  it('sends one edit per press', () => {
    expect(hairpinTools().map((tool) => tool.run)).toEqual([
      { kind: 'edit', edit: { type: 'toggleHairpin', hairpin: 'crescendo' } },
      { kind: 'edit', edit: { type: 'toggleHairpin', hairpin: 'decrescendo' } },
    ]);
    expect(pedalTools().map((tool) => tool.run)).toEqual([
      { kind: 'edit', edit: { type: 'togglePedal', action: 'down' } },
      { kind: 'edit', edit: { type: 'togglePedal', action: 'up' } },
    ]);
  });

  it('lights no pedal without a beat at the cursor', () => {
    expect(pedalTools().map((tool) => tool.isActive?.({ keySignature: 0 }))).toEqual([false, false]);
  });
});
