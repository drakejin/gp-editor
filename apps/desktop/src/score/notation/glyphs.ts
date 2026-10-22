import type {
  CurveCommand,
  DrawAlign,
  LineCommand,
  PolygonCommand,
  TextCommand,
} from '../draw';
import { MUSIC_FONT_SIZE } from './metrics';

/** A Bravura glyph with its origin (baseline) at (x, y). */
export function musicGlyph(
  x: number,
  y: number,
  text: string,
  color: string,
  align: DrawAlign = 'left',
): TextCommand {
  return {
    kind: 'text',
    x,
    y,
    text,
    size: MUSIC_FONT_SIZE,
    color,
    font: 'music',
    align,
  };
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
): LineCommand {
  return { kind: 'line', x1, y1, x2, y2, width, color };
}

export function horizontal(
  x1: number,
  x2: number,
  y: number,
  width: number,
  color: string,
): LineCommand {
  return line(x1, y, x2, y, width, color);
}

export function vertical(
  x: number,
  y1: number,
  y2: number,
  width: number,
  color: string,
): LineCommand {
  return line(x, y1, x, y2, width, color);
}

export function polygon(
  points: readonly number[],
  color: string,
): PolygonCommand {
  return { kind: 'polygon', points, color };
}

/** A tie-like arc from (x1, y) to (x2, y) bulging by `height` (negative = upwards). */
export function arc(
  x1: number,
  x2: number,
  y: number,
  height: number,
  width: number,
  color: string,
): CurveCommand {
  // A quadratic Bézier reaches half-way to its control point.
  return {
    kind: 'curve',
    x1,
    y1: y,
    cx: (x1 + x2) / 2,
    cy: y + height * 2,
    x2,
    y2: y,
    width,
    color,
  };
}

/** A number written with consecutive SMuFL digit glyphs starting at `zeroCodePoint`. */
export function digitGlyphs(value: number, zeroCodePoint: number): string {
  return [...String(Math.abs(Math.trunc(value)))]
    .map(digit => String.fromCodePoint(zeroCodePoint + Number(digit)))
    .join('');
}
