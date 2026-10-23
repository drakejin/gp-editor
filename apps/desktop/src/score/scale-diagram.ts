import type { GuitarString, ScaleBox } from '@gp-editor/core';
import { pitchClassName } from '../lib/pitch';
import type { DrawCommand } from './draw';

/** A scale box drawn as in a method book: strings across (string 1 on top), frets down, a dot per note; in points. */
export const SCALE_DIAGRAM = {
  stringGap: 18,
  /** Room above string 1 and, below the last string, for the fret numbers. */
  top: 16,
  bottom: 28,
  /** Column of the open strings' names, left of the grid. */
  left: 24,
  right: 12,
  /** Column left of the nut for the open notes of a box at the nut. */
  openWidth: 24,
  dotRadius: 7.5,
  nutWidth: 4,
  nameSize: 7.5,
  labelSize: 9,
  radius: 6,
} as const;

/** Black on white whatever the appearance, so the diagram looks printed; roots in the score's orange. */
export const DIAGRAM_COLORS = { paper: '#FFFFFF', line: '#2B2B2E', muted: '#6E6E73', note: '#1D1D1F', root: '#D4572A', text: '#FFFFFF' } as const;

export interface ScaleDiagramInput {
  readonly box: ScaleBox;
  /** The neck's strings (string 1 = highest). */
  readonly strings: readonly GuitarString[];
  readonly width: number;
  /** Note names by pitch class, spelled for the scale; sharps when left out. */
  readonly names?: ReadonlyMap<number, string>;
}

export function scaleDiagramHeight(stringCount: number): number {
  return SCALE_DIAGRAM.top + Math.max(0, stringCount - 1) * SCALE_DIAGRAM.stringGap + SCALE_DIAGRAM.bottom;
}

interface DiagramGrid {
  /** Fret of the first column right of the nut or the first fret line. */
  readonly firstColumnFret: number;
  readonly columns: number;
  readonly gridLeft: number;
  readonly columnWidth: number;
  readonly hasNut: boolean;
  readonly bottom: number;
}

function diagramGrid(box: ScaleBox, width: number, stringCount: number): DiagramGrid {
  const hasNut = box.firstFret === 0;
  const firstColumnFret = hasNut ? 1 : box.firstFret;
  const columns = Math.max(1, box.lastFret - firstColumnFret + 1);
  const gridLeft = SCALE_DIAGRAM.left + (hasNut ? SCALE_DIAGRAM.openWidth : 0);
  const columnWidth = Math.max(8, (width - gridLeft - SCALE_DIAGRAM.right) / columns);
  return { firstColumnFret, columns, gridLeft, columnWidth, hasNut, bottom: stringY(stringCount) };
}

function stringY(stringNumber: number): number {
  return SCALE_DIAGRAM.top + (stringNumber - 1) * SCALE_DIAGRAM.stringGap;
}

/** Centre of a fret's column; an open note sits left of the nut. */
function columnX(grid: DiagramGrid, fret: number): number {
  return fret === 0 && grid.hasNut ? SCALE_DIAGRAM.left + SCALE_DIAGRAM.openWidth / 2 : grid.gridLeft + (fret - grid.firstColumnFret + 0.5) * grid.columnWidth;
}

/** The box on paper: grid, fret numbers, the strings' names, then a named dot per note (roots in their colour). */
export function engraveScaleDiagram(input: ScaleDiagramInput): DrawCommand[] {
  const { box, strings, width } = input;
  const grid = diagramGrid(box, width, strings.length);
  const paper: DrawCommand = { kind: 'rect', x: 0, y: 0, width, height: scaleDiagramHeight(strings.length), color: DIAGRAM_COLORS.paper, radius: SCALE_DIAGRAM.radius };
  return [paper, ...gridLines(grid, strings), ...fretNumbers(grid), ...stringNames(strings), ...dots(grid, input)];
}

function gridLines(grid: DiagramGrid, strings: readonly GuitarString[]): DrawCommand[] {
  const right = grid.gridLeft + grid.columns * grid.columnWidth;
  const frets = Array.from({ length: grid.columns + 1 }, (_, i): DrawCommand => {
    const x = grid.gridLeft + i * grid.columnWidth;
    const isNut = i === 0 && grid.hasNut;
    return { kind: 'line', x1: x, y1: SCALE_DIAGRAM.top, x2: x, y2: grid.bottom, width: isNut ? SCALE_DIAGRAM.nutWidth : 1, color: DIAGRAM_COLORS.line };
  });
  const lines = strings.map((string): DrawCommand => {
    const y = stringY(string.number);
    return { kind: 'line', x1: grid.gridLeft, y1: y, x2: right, y2: y, width: 1, color: DIAGRAM_COLORS.line };
  });
  return [...frets, ...lines];
}

function fretNumbers(grid: DiagramGrid): DrawCommand[] {
  const y = grid.bottom + SCALE_DIAGRAM.bottom / 2 + 2;
  return Array.from({ length: grid.columns }, (_, i): DrawCommand => {
    const fret = grid.firstColumnFret + i;
    return { kind: 'text', x: columnX(grid, fret), y, text: String(fret), size: SCALE_DIAGRAM.labelSize, color: DIAGRAM_COLORS.muted, font: 'ui', align: 'center' };
  });
}

function stringNames(strings: readonly GuitarString[]): DrawCommand[] {
  return strings.map(
    (string): DrawCommand => ({ kind: 'text', x: SCALE_DIAGRAM.left / 2, y: stringY(string.number), text: pitchClassName(string.tuning), size: SCALE_DIAGRAM.labelSize, color: DIAGRAM_COLORS.muted, font: 'ui', align: 'center', bold: true }),
  );
}

function dots(grid: DiagramGrid, input: ScaleDiagramInput): DrawCommand[] {
  return input.box.positions.flatMap((position): DrawCommand[] => {
    const x = columnX(grid, position.fret);
    const y = stringY(position.string);
    const name = input.names?.get(((position.pitch % 12) + 12) % 12) ?? pitchClassName(position.pitch);
    return [
      { kind: 'circle', x, y, radius: SCALE_DIAGRAM.dotRadius, color: position.isRoot ? DIAGRAM_COLORS.root : DIAGRAM_COLORS.note },
      { kind: 'text', x, y, text: name, size: SCALE_DIAGRAM.nameSize, color: DIAGRAM_COLORS.text, font: 'ui', align: 'center', bold: true },
    ];
  });
}
