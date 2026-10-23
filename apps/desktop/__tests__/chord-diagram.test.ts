import type { Chord } from '@gp-editor/core';
import type { CircleCommand, DrawCommand, LineCommand, RectCommand } from '../src/score/draw';
import { CHORD_DIAGRAM, diagramBarre, diagramFirstFret, diagramHeight, diagramStringX, diagramWidth, engraveChordDiagram, hitTestDiagram } from '../src/score/chord-diagram';
import { allFinite, texts } from '../test-support/score-helpers';

const C_MAJOR: Chord = { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] };
const F_BARRE: Chord = { name: 'F', firstFret: 1, frets: [1, 1, 2, 3, 3, 1] };
const D_AT_FIVE: Chord = { name: 'D', firstFret: 5, frets: [5, 7, 7, 7, 5, -1] };

const lines = (commands: readonly DrawCommand[]) => commands.filter((command): command is LineCommand => command.kind === 'line');
const circles = (commands: readonly DrawCommand[]) => commands.filter((command): command is CircleCommand => command.kind === 'circle');
const rects = (commands: readonly DrawCommand[]) => commands.filter((command): command is RectCommand => command.kind === 'rect');
const dots = (commands: readonly DrawCommand[]) => circles(commands).filter((circle) => circle.strokeWidth === undefined);

describe('engraveChordDiagram', () => {
  it('draws the strings, the nut and frets, a dot per fretted string, and open and muted marks above', () => {
    // Act
    const commands = engraveChordDiagram(C_MAJOR, 100, 20, '#222222');

    // Assert
    const vertical = lines(commands).filter((line) => line.x1 === line.x2);
    const horizontal = lines(commands).filter((line) => line.y1 === line.y2);
    const diagonal = lines(commands).filter((line) => line.x1 !== line.x2 && line.y1 !== line.y2);
    expect(vertical).toHaveLength(6);
    expect(diagonal).toHaveLength(2);
    expect(horizontal).toHaveLength(6);
    expect(horizontal[0]?.width).toBe(CHORD_DIAGRAM.nutWidth);
    expect(dots(commands)).toHaveLength(3);
    expect(circles(commands).filter((circle) => circle.strokeWidth !== undefined)).toHaveLength(2);
    expect(allFinite(commands)).toBe(true);
  });

  it('puts string 1 on the right and the dot of fret 3 in the third fret space', () => {
    // Act
    const commands = engraveChordDiagram(C_MAJOR, 100, 20, '#222222');

    // Assert
    const onFifth = dots(commands).find((dot) => dot.x === diagramStringX(100, 6, 5));
    const gridTop = 20 + CHORD_DIAGRAM.markerHeight;
    expect(diagramStringX(100, 6, 1)).toBeGreaterThan(diagramStringX(100, 6, 6));
    expect(onFifth?.y).toBeCloseTo(gridTop + 2.5 * CHORD_DIAGRAM.fretGap);
  });

  it('draws a barre over the strings held by one finger', () => {
    // Act
    const commands = engraveChordDiagram(F_BARRE, 100, 20, '#222222');

    // Assert
    expect(diagramBarre(F_BARRE)).toEqual({ fret: 1, fromString: 6, toString: 1 });
    expect(rects(commands)).toHaveLength(1);
    expect(rects(commands)[0]?.width).toBeGreaterThan(diagramWidth(6) - 2 * CHORD_DIAGRAM.dotRadius);
  });

  it('labels the first fret when the diagram starts above the nut, with a thin top line', () => {
    // Act
    const commands = engraveChordDiagram(D_AT_FIVE, 100, 20, '#222222');

    // Assert
    expect(texts(commands).map((text) => text.text)).toEqual(['5']);
    expect(lines(commands).filter((line) => line.y1 === line.y2)[0]?.width).toBe(CHORD_DIAGRAM.lineWidth);
    expect(dots(commands).length + rects(commands).length).toBeGreaterThan(0);
  });

  it('draws only the strings of a chord with neither played strings nor frets in reach', () => {
    const commands = engraveChordDiagram({ name: 'N.C.', firstFret: 1, frets: [-1, -1, -1, -1] }, 50, 0, '#222222');
    expect(dots(commands)).toHaveLength(0);
    expect(lines(commands).filter((line) => line.x1 === line.x2)).toHaveLength(4);
    expect(lines(commands).filter((line) => line.x1 !== line.x2 && line.y1 !== line.y2)).toHaveLength(8);
  });
});

describe('diagramBarre', () => {
  it.each<[string, Chord]>([
    ['three dots of one fret with nothing above them (A)', { name: 'A', firstFret: 1, frets: [0, 2, 2, 2, 0, -1] }],
    ['an open chord', C_MAJOR],
    ['the open D, whose two dots of fret 2 are fingertips', { name: 'D', firstFret: 1, frets: [2, 3, 2, 0, -1, -1] }],
    ['a lowest fret broken by an open string', { name: '?', firstFret: 1, frets: [2, 0, 2, 4, -1, -1] }],
  ])('finds none for %s', (_, chord) => {
    expect(diagramBarre(chord)).toBeUndefined();
  });

  it('finds the barre of a shape higher up', () => {
    expect(diagramBarre({ name: 'Bm', firstFret: 1, frets: [2, 3, 4, 4, 2, -1] })).toEqual({ fret: 2, fromString: 5, toString: 1 });
  });
});

describe('diagramFirstFret', () => {
  it('keeps the file’s first fret when the frets fit under it, else finds one', () => {
    expect(diagramFirstFret(D_AT_FIVE)).toBe(5);
    expect(diagramFirstFret({ name: 'C', firstFret: 1, frets: [3, 5, 5, 5, 3, -1] })).toBe(1);
    expect(diagramFirstFret({ name: 'D', firstFret: 1, frets: [10, 10, 11, 12, -1, -1] })).toBe(10);
    expect(diagramFirstFret({ name: 'C', firstFret: 0, frets: [0, 1, 0, 2, 3, -1] })).toBe(1);
  });
});

describe('hitTestDiagram', () => {
  const top = 20;
  const gridTop = top + CHORD_DIAGRAM.markerHeight;

  it('finds the string and fret under a point, or the open-string row above the nut', () => {
    expect(hitTestDiagram(6, 1, 100, top, diagramStringX(100, 6, 5), gridTop + 2.4 * CHORD_DIAGRAM.fretGap)).toEqual({ string: 5, fret: 3 });
    expect(hitTestDiagram(6, 5, 100, top, diagramStringX(100, 6, 1) + 1, gridTop + 0.2 * CHORD_DIAGRAM.fretGap)).toEqual({ string: 1, fret: 5 });
    expect(hitTestDiagram(6, 1, 100, top, diagramStringX(100, 6, 2), top + 1)).toEqual({ string: 2, fret: 'open' });
  });

  it('finds nothing beside or under the grid', () => {
    expect(hitTestDiagram(6, 1, 100, top, 0, gridTop + 5)).toBeUndefined();
    expect(hitTestDiagram(6, 1, 100, top, 100, top + diagramHeight() + 10)).toBeUndefined();
  });
});
