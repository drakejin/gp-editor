import type { DrawCommand, LineCommand } from '../src/score/draw';
import { TEXT_NOTE_GLYPHS } from '../src/score/symbols/smufl';
import { SWING, engraveTripletFeel } from '../src/score/triplet-feel';
import { allFinite, texts } from '../test-support/score-helpers';

const X = 50;
const Y = 21;
const COLOR = '#123456';
const G = TEXT_NOTE_GLYPHS;

const lines = (commands: readonly DrawCommand[]): LineCommand[] => commands.filter((c): c is LineCommand => c.kind === 'line');

describe('engraveTripletFeel', () => {
  it('writes eighths swing as two beamed eighths = a quarter and an eighth under a triplet bracket', () => {
    // Act
    const commands = engraveTripletFeel('eighth', X, Y, COLOR);

    // Assert
    expect(texts(commands).map((c) => c.text)).toEqual([
      G.quarter.text + G.beam8th.text + G.beamEnd8th.text,
      '=',
      G.quarter.text,
      G.eighth.text,
      '3',
    ]);
    expect(lines(commands)).toHaveLength(4);
  });

  it('writes sixteenths swing as two beamed sixteenths = an eighth and a sixteenth under a triplet bracket', () => {
    // Act
    const commands = engraveTripletFeel('sixteenth', X, Y, COLOR);

    // Assert
    expect(texts(commands).map((c) => c.text)).toEqual([
      G.quarter.text + G.beam16th.text + G.beamEnd16th.text,
      '=',
      G.quarter.text + G.beam8th.text + G.beamEnd16th.text,
      '3',
    ]);
  });

  it('writes "Straight" when the feel goes back to straight', () => {
    // Act
    const commands = engraveTripletFeel('none', X, Y, COLOR);

    // Assert
    expect(commands).toEqual([expect.objectContaining({ kind: 'text', text: 'Straight', x: X, y: Y, font: 'ui', align: 'left', color: COLOR })]);
  });

  it('reads left to right from x, in one colour, with the notes in the music font', () => {
    // Act
    const commands = engraveTripletFeel('eighth', X, Y, COLOR);
    const [left, equals, quarter, eighth] = texts(commands);

    // Assert
    expect(allFinite(commands)).toBe(true);
    expect(commands.every((c) => c.color === COLOR)).toBe(true);
    expect(left).toMatchObject({ x: X, font: 'music', size: SWING.musicSize, align: 'left' });
    expect(equals!.x).toBeGreaterThan(left!.x);
    expect(quarter!.x).toBeGreaterThan(equals!.x);
    expect(eighth!.x).toBeGreaterThan(quarter!.x);
  });

  it('keeps the bracket above the notes and the notes about the line y', () => {
    // Act
    const commands = engraveTripletFeel('eighth', X, Y, COLOR);
    const [left] = texts(commands);
    const bracketY = Math.min(...lines(commands).flatMap((line) => [line.y1, line.y2]));
    const stemTop = left!.y - G.quarter.top * (SWING.musicSize / 4);

    // Assert
    expect(bracketY).toBeLessThan(stemTop);
    expect(Math.abs((stemTop + left!.y) / 2 - Y)).toBeLessThan(SWING.musicSize / 4);
  });
});
