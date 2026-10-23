import { SCALE_ROOTS, scaleBoxes, scaleIndexNamed } from '@gp-editor/core';
import type { CircleCommand, LineCommand } from '../src/score/draw';
import { DIAGRAM_COLORS, SCALE_DIAGRAM, engraveScaleDiagram, scaleDiagramHeight } from '../src/score/scale-diagram';
import { allFinite, texts } from '../test-support/score-helpers';

const strings = (...tuning: number[]) => tuning.map((open, i) => ({ number: i + 1, tuning: open }));
const GUITAR = strings(64, 59, 55, 50, 45, 40);
const choice = (rootName: string, scaleName: string) => ({ rootIndex: SCALE_ROOTS.findIndex((root) => root.name === rootName), scaleIndex: scaleIndexNamed(scaleName) ?? -1 });
const circles = (commands: ReturnType<typeof engraveScaleDiagram>) => commands.filter((command): command is CircleCommand => command.kind === 'circle');

describe('engraveScaleDiagram', () => {
  it('draws a box as a printed diagram: a dot per note, the roots apart, the frets numbered', () => {
    // Arrange: A minor pentatonic, first box (frets 4–8)
    const box = scaleBoxes(choice('A', 'Pentatonic Minor Scale'), GUITAR)[0]!;

    // Act
    const commands = engraveScaleDiagram({ box, strings: GUITAR, width: 360 });

    // Assert
    expect(circles(commands)).toHaveLength(box.positions.length);
    expect(circles(commands).filter((dot) => dot.color === DIAGRAM_COLORS.root)).toHaveLength(box.positions.filter((position) => position.isRoot).length);
    expect(texts(commands).filter((text) => text.color === DIAGRAM_COLORS.muted).map((text) => text.text)).toEqual(['4', '5', '6', '7', '8', 'E', 'B', 'G', 'D', 'A', 'E']);
    expect(commands[0]).toMatchObject({ kind: 'rect', color: DIAGRAM_COLORS.paper });
    expect(allFinite(commands)).toBe(true);
  });

  it('names each dot, spelled as given', () => {
    const box = scaleBoxes(choice('Eb', 'Major Scale'), GUITAR)[0]!;
    const names = new Map([[3, 'Eb'], [5, 'F'], [7, 'G'], [8, 'Ab'], [10, 'Bb'], [0, 'C'], [2, 'D']]);
    const dots = texts(engraveScaleDiagram({ box, strings: GUITAR, width: 360, names })).filter((text) => text.color === DIAGRAM_COLORS.text);
    expect(new Set(dots.map((text) => text.text))).toEqual(new Set(names.values()));
  });

  it('draws the nut for a box at the open strings, its open notes left of it', () => {
    // Arrange: E major's first box starts at the nut (frets 0–4)
    const box = scaleBoxes(choice('E', 'Major Scale'), GUITAR)[0]!;

    // Act
    const commands = engraveScaleDiagram({ box, strings: GUITAR, width: 360 });

    // Assert
    const lines = commands.filter((command): command is LineCommand => command.kind === 'line');
    const nut = lines.find((line) => line.width === SCALE_DIAGRAM.nutWidth);
    expect(nut).toBeDefined();
    const openDots = circles(commands).filter((dot) => dot.x < nut!.x1);
    expect(openDots.length).toBe(box.positions.filter((position) => position.fret === 0).length);
  });

  it('grows with the strings, 3 to 10', () => {
    expect(scaleDiagramHeight(3)).toBeLessThan(scaleDiagramHeight(6));
    expect(scaleDiagramHeight(10)).toBe(SCALE_DIAGRAM.top + 9 * SCALE_DIAGRAM.stringGap + SCALE_DIAGRAM.bottom);
  });
});
