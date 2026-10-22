import { QUARTER } from '@gp-editor/core';
import type { Beat, Note, StrokeDirection } from '@gp-editor/core';
import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import type { DrawCommand, TextCommand } from '../src/score/draw';
import { NOTATION, engraveNotationMeasure } from '../src/score/notation';
import { PICK_STROKE_GLYPHS, TECHNIQUE_GLYPHS } from '../src/score/symbols/smufl';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const TOP = NOTATION.above;
const SPACE = NOTATION.space;
const DOWN = PICK_STROKE_GLYPHS.down;
const UP = PICK_STROKE_GLYPHS.up;

function picked(start: number, pickStroke: StrokeDirection, notes: Note[] = [note(3, 2)]): Beat {
  return { ...beat(start, notes), pickStroke };
}

function engrave(beats: Beat[], showsPickStrokes = true): { commands: DrawCommand[]; layout: MeasureLayout } {
  const song = makeSong([beats]);
  const track = song.tracks[0]!;
  const layout = layoutMeasure(song, 0, 0);
  const commands = engraveNotationMeasure({
    track, header: song.measureHeaders[0]!, measure: track.measures[0]!, layout, top: TOP, palette: PALETTE, showsPickStrokes,
  });
  return { commands, layout };
}

const glyphsOf = (commands: readonly DrawCommand[], text: string): TextCommand[] => texts(commands).filter((c) => c.text === text);

describe('pick strokes over the notation staff', () => {
  it('draws a down-bow and an up-bow over their beats, above the staff', () => {
    // Act
    const { commands, layout } = engrave([picked(960, 'down'), picked(1920, 'none'), picked(2880, 'up')]);

    // Assert
    const [down] = glyphsOf(commands, DOWN.text);
    const [up] = glyphsOf(commands, UP.text);
    expect(down).toMatchObject({ x: layout.beats[0]!.x, align: 'center', font: 'music', color: PALETTE.text });
    expect(up).toMatchObject({ x: layout.beats[2]!.x });
    expect(down!.y).toBeLessThan(TOP);
    expect(up!.y).toBeLessThan(TOP);
  });

  it('draws nothing when the tab staff shows the pick strokes instead', () => {
    // Act
    const { commands } = engrave([picked(960, 'down'), picked(1920, 'up')], false);

    // Assert
    expect(glyphsOf(commands, DOWN.text)).toHaveLength(0);
    expect(glyphsOf(commands, UP.text)).toHaveLength(0);
  });

  it('goes above a high note and its ledger lines', () => {
    // Arrange: fret 17 on the top string is far above the staff
    const high = picked(960, 'down', [note(1, 17)]);

    // Act
    const { commands } = engrave([high]);

    // Assert
    const [down] = glyphsOf(commands, DOWN.text);
    const heads = texts(commands).filter((c) => c.font === 'music' && c.text !== DOWN.text);
    expect(down!.y).toBeLessThan(Math.min(...heads.map((c) => c.y)) - SPACE / 2);
  });

  it('stacks above a trill on the same note', () => {
    // Arrange
    const trill = { fret: 4, duration: { ...QUARTER, value: 16 as const } };

    // Act
    const { commands } = engrave([picked(960, 'up', [note(3, 2, { trill })])]);

    // Assert
    const [up] = glyphsOf(commands, UP.text);
    const [tr] = glyphsOf(commands, TECHNIQUE_GLYPHS.ornamentTrill.text);
    expect(up!.y).toBeLessThan(tr!.y - TECHNIQUE_GLYPHS.ornamentTrill.top * SPACE);
  });

  it('stays inside the notation band', () => {
    // Act
    const { commands } = engrave([picked(960, 'up', [note(1, 24)])]);

    // Assert
    const [up] = glyphsOf(commands, UP.text);
    expect(up!.y - UP.top * SPACE).toBeGreaterThanOrEqual(TOP - NOTATION.above);
  });
});
