import { type Chord, DIAGRAM_FRETS, chordFirstFret } from '@gp-editor/core';
import type { DrawCommand } from './draw';

/**
 * A chord diagram (after TuxGuitar's TGChordImpl#paintDiagram): strings upright, the lowest on the left, DIAGRAM_FRETS
 * frets under the nut (or under the first fret, numbered), a dot per fretted string, a barre, and open (o) and
 * not-played (x) marks above. In points; the score draws it at this size, the chord panel larger.
 */
export const CHORD_DIAGRAM = {
  stringGap: 5,
  fretGap: 6.5,
  /** The row of open and not-played marks above the nut. */
  markerHeight: 6,
  dotRadius: 2.1,
  openRadius: 1.6,
  muteSize: 1.6,
  lineWidth: 0.6,
  nutWidth: 2,
  fretLabelSize: 7,
  fretLabelGap: 3,
} as const;

export function diagramWidth(stringCount: number): number {
  return Math.max(0, stringCount - 1) * CHORD_DIAGRAM.stringGap;
}

/** From the top of the marks to the last fret line. */
export function diagramHeight(): number {
  return CHORD_DIAGRAM.markerHeight + DIAGRAM_FRETS * CHORD_DIAGRAM.fretGap;
}

/** The x of a string (1 = highest, on the right) in a diagram centred on `x`. */
export function diagramStringX(x: number, stringCount: number, string: number): number {
  return x - diagramWidth(stringCount) / 2 + (stringCount - string) * CHORD_DIAGRAM.stringGap;
}

/** The fret the diagram starts at: the chord's own first fret when its frets fit under it, else one that fits them. */
export function diagramFirstFret(chord: Chord): number {
  const fretted = chord.frets.filter((fret) => fret > 0);
  const fits = (first: number) => fretted.every((fret) => fret >= first && fret < first + DIAGRAM_FRETS);
  return chord.firstFret >= 1 && fits(chord.firstFret) ? chord.firstFret : chordFirstFret(chord.frets);
}

/** One finger across strings: `fromString` (lower) to `toString` (higher), both numbered as Note.string. */
export interface Barre {
  readonly fret: number;
  readonly fromString: number;
  readonly toString: number;
}

/**
 * The barre a diagram shows: the lowest fret, held on two strings or more with every string between them fretted
 * at it or higher, and at least one of those higher (three dots of one fret alone are fingers, as in A).
 */
export function diagramBarre(chord: Chord): Barre | undefined {
  const fretted = chord.frets.filter((fret) => fret > 0);
  if (fretted.length === 0) {
    return undefined;
  }
  const fret = Math.min(...fretted);
  const strings = chord.frets.flatMap((value, i) => (value === fret ? [i + 1] : []));
  const toString = strings[0];
  const fromString = strings[strings.length - 1];
  if (toString === undefined || fromString === undefined || strings.length < 2) {
    return undefined;
  }
  const between = chord.frets.slice(toString - 1, fromString);
  return between.every((value) => value >= fret) && between.some((value) => value > fret) ? { fret, fromString, toString } : undefined;
}

function gridLines(x: number, gridTop: number, stringCount: number, firstFret: number, color: string): DrawCommand[] {
  const { fretGap, lineWidth, nutWidth } = CHORD_DIAGRAM;
  const left = diagramStringX(x, stringCount, stringCount);
  const right = diagramStringX(x, stringCount, 1);
  const bottom = gridTop + DIAGRAM_FRETS * fretGap;
  const strings = Array.from({ length: stringCount }, (_, i): DrawCommand => {
    const sx = diagramStringX(x, stringCount, i + 1);
    return { kind: 'line', x1: sx, y1: gridTop, x2: sx, y2: bottom, width: lineWidth, color };
  });
  const frets = Array.from({ length: DIAGRAM_FRETS + 1 }, (_, i): DrawCommand => {
    const width = i === 0 && firstFret === 1 ? nutWidth : lineWidth;
    return { kind: 'line', x1: left, y1: gridTop + i * fretGap, x2: right, y2: gridTop + i * fretGap, width, color };
  });
  return [...strings, ...frets];
}

/** o over an open string, x over one not played. */
function stringMark(sx: number, y: number, fret: number, color: string): DrawCommand[] {
  const { openRadius, muteSize, lineWidth } = CHORD_DIAGRAM;
  if (fret === 0) {
    return [{ kind: 'circle', x: sx, y, radius: openRadius, color, strokeWidth: lineWidth * 1.4 }];
  }
  return [
    { kind: 'line', x1: sx - muteSize, y1: y - muteSize, x2: sx + muteSize, y2: y + muteSize, width: lineWidth * 1.4, color },
    { kind: 'line', x1: sx - muteSize, y1: y + muteSize, x2: sx + muteSize, y2: y - muteSize, width: lineWidth * 1.4, color },
  ];
}

function barreCommand(x: number, gridTop: number, stringCount: number, firstFret: number, barre: Barre, color: string): DrawCommand {
  const { dotRadius, fretGap } = CHORD_DIAGRAM;
  const left = diagramStringX(x, stringCount, barre.fromString) - dotRadius;
  const right = diagramStringX(x, stringCount, barre.toString) + dotRadius;
  const y = gridTop + (barre.fret - firstFret + 0.5) * fretGap;
  return { kind: 'rect', x: left, y: y - dotRadius, width: right - left, height: dotRadius * 2, color, radius: dotRadius };
}

/**
 * The chord's diagram centred on `x`, its marks' top at `top`, from `firstFret` (by default `diagramFirstFret`: the
 * chord panel's grid keeps its own). Frets out of the diagram's reach are left out.
 */
export function engraveChordDiagram(chord: Chord, x: number, top: number, color: string, firstFret = diagramFirstFret(chord)): DrawCommand[] {
  const { markerHeight, fretGap, dotRadius, fretLabelSize, fretLabelGap } = CHORD_DIAGRAM;
  const stringCount = chord.frets.length;
  const gridTop = top + markerHeight;
  const barre = diagramBarre(chord);
  const isInBarre = (fret: number, string: number) => barre !== undefined && fret === barre.fret && string <= barre.fromString && string >= barre.toString;
  const notes = chord.frets.flatMap((fret, i): DrawCommand[] => {
    const string = i + 1;
    const sx = diagramStringX(x, stringCount, string);
    if (fret <= 0) {
      return stringMark(sx, top + markerHeight / 2 - 0.5, fret, color);
    }
    const row = fret - firstFret;
    return row < 0 || row >= DIAGRAM_FRETS || isInBarre(fret, string) ? [] : [{ kind: 'circle', x: sx, y: gridTop + (row + 0.5) * fretGap, radius: dotRadius, color }];
  });
  const label: DrawCommand[] =
    firstFret > 1
      ? [{ kind: 'text', x: diagramStringX(x, stringCount, stringCount) - fretLabelGap, y: gridTop + fretGap / 2, text: String(firstFret), size: fretLabelSize, color, font: 'ui', align: 'right' }]
      : [];
  const barreCommands = barre === undefined || barre.fret - firstFret >= DIAGRAM_FRETS ? [] : [barreCommand(x, gridTop, stringCount, firstFret, barre, color)];
  return [...gridLines(x, gridTop, stringCount, firstFret, color), ...label, ...barreCommands, ...notes];
}

/** What a click on a diagram points at: a string's fret, or the open-string row above the nut. */
export interface DiagramHit {
  readonly string: number;
  readonly fret: number | 'open';
}

/** The string and fret under (px, py) of a diagram centred on `x`, its marks' top at `top`; undefined off the grid. */
export function hitTestDiagram(stringCount: number, firstFret: number, x: number, top: number, px: number, py: number): DiagramHit | undefined {
  const { stringGap, markerHeight, fretGap } = CHORD_DIAGRAM;
  const left = diagramStringX(x, stringCount, stringCount);
  const column = Math.round((px - left) / stringGap);
  const gridTop = top + markerHeight;
  if (column < 0 || column >= stringCount || Math.abs(px - (left + column * stringGap)) > stringGap / 2 || py < top) {
    return undefined;
  }
  const string = stringCount - column;
  if (py < gridTop) {
    return { string, fret: 'open' };
  }
  const row = Math.floor((py - gridTop) / fretGap);
  return row < DIAGRAM_FRETS ? { string, fret: firstFret + row } : undefined;
}
