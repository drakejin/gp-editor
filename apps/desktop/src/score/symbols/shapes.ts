import type {
  CurveCommand,
  DrawCommand,
  LineCommand,
  PolygonCommand,
  TextCommand,
} from '../draw';
import { type MusicGlyph, staffSpace } from './smufl';

/** Shapes shared by the notation and tab engravers for playing techniques. */

export type ArrowDirection = 'up' | 'down';

const ARROW = {
  /** Length and base width of an arrowhead. */
  size: 4,
} as const;

const DASH = {
  pattern: [3, 2],
  width: 0.8,
  /** Shorter dashed spans are left out. */
  minLength: 4,
} as const;

/** Advance of a label character relative to the font size (system font, like OTTAVA.charWidth). */
const CHAR_WIDTH = 0.56;

/** A filled triangle with its tip at (x, y), pointing up or down. */
export function arrowhead(
  x: number,
  y: number,
  direction: ArrowDirection,
  size: number,
  color: string,
): PolygonCommand {
  const back = direction === 'up' ? y + size : y - size;
  const half = size / 2;
  const points =
    direction === 'up'
      ? [x, y, x + half, back, x - half, back]
      : [x, y, x - half, back, x + half, back];
  return { kind: 'polygon', points, color };
}

/** A vertical arrow from `from` to its tip at `to`. */
export function verticalArrow(
  x: number,
  from: number,
  to: number,
  width: number,
  color: string,
): DrawCommand[] {
  const direction: ArrowDirection = to < from ? 'up' : 'down';
  const shaftEnd = direction === 'up' ? to + ARROW.size : to - ARROW.size;
  return [
    { kind: 'line', x1: x, y1: from, x2: x, y2: shaftEnd, width, color },
    arrowhead(x, to, direction, ARROW.size, color),
  ];
}

/** A wavy line of one glyph repeated from x1 towards x2, as a single text command; empty when not one glyph fits. */
export function wavyLine(
  x1: number,
  x2: number,
  y: number,
  glyph: MusicGlyph,
  size: number,
  color: string,
): TextCommand[] {
  const count = Math.floor((x2 - x1) / (glyph.advance * staffSpace(size)));
  if (count < 1) {
    return [];
  }
  return [
    {
      kind: 'text',
      x: x1,
      y,
      text: glyph.text.repeat(count),
      size,
      color,
      font: 'music',
      align: 'left',
    },
  ];
}

/** A curve from (x1, y1) to (x2, y2) bowed by `bulge` (negative = upwards) at its middle. */
export function bowCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
  width: number,
  color: string,
): CurveCommand {
  // A quadratic Bézier reaches half-way to its control point.
  return {
    kind: 'curve',
    x1,
    y1,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2 + bulge * 2,
    x2,
    y2,
    width,
    color,
  };
}

/** A stretch of x a link leaves out where it crosses something drawn there (a key or time signature at a bar line). */
export interface Gap {
  readonly from: number;
  readonly to: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * A `bowCurve` with the part over `gap` left out, as the curve's two pieces (de Casteljau). Its control point is
 * midway in x, so x runs linearly along it and the gap's ends fall exactly where x crosses them.
 */
export function curveAround(curve: CurveCommand, gap: Gap): CurveCommand[] {
  const span = curve.x2 - curve.x1;
  if (
    gap.to <= gap.from ||
    span <= 0 ||
    gap.from >= curve.x2 ||
    gap.to <= curve.x1
  ) {
    return [curve];
  }
  const at = (x: number) => Math.min(1, Math.max(0, (x - curve.x1) / span));
  const yAt = (t: number) =>
    lerp(lerp(curve.y1, curve.cy, t), lerp(curve.cy, curve.y2, t), t);
  const [a, b] = [at(gap.from), at(gap.to)];
  const before: CurveCommand = {
    ...curve,
    cx: lerp(curve.x1, curve.cx, a),
    cy: lerp(curve.y1, curve.cy, a),
    x2: lerp(curve.x1, curve.x2, a),
    y2: yAt(a),
  };
  const after: CurveCommand = {
    ...curve,
    x1: lerp(curve.x1, curve.x2, b),
    y1: yAt(b),
    cx: lerp(curve.cx, curve.x2, b),
    cy: lerp(curve.cy, curve.y2, b),
  };
  return [...(a > 0 ? [before] : []), ...(b < 1 ? [after] : [])];
}

/** A straight line with the part over `gap` left out: its pieces either side, still on the one line. */
export function lineAround(line: LineCommand, gap: Gap): LineCommand[] {
  const span = line.x2 - line.x1;
  if (
    gap.to <= gap.from ||
    span <= 0 ||
    gap.from >= line.x2 ||
    gap.to <= line.x1
  ) {
    return [line];
  }
  const yAt = (x: number) => lerp(line.y1, line.y2, (x - line.x1) / span);
  const from = Math.max(line.x1, gap.from);
  const to = Math.min(line.x2, gap.to);
  return [
    ...(from > line.x1 ? [{ ...line, x2: from, y2: yAt(from) }] : []),
    ...(to < line.x2 ? [{ ...line, x1: to, y1: yAt(to) }] : []),
  ];
}

/**
 * Half of a tie or slur: from (x, y) to its crest at (crestX, y + height), level there, so the outgoing half at the
 * end of one measure and the incoming half at the start of the next join into one arc across the bar line.
 */
export function halfArc(
  x: number,
  crestX: number,
  y: number,
  height: number,
  width: number,
  color: string,
): CurveCommand {
  return {
    kind: 'curve',
    x1: x,
    y1: y,
    cx: (x + crestX) / 2,
    cy: y + height,
    x2: crestX,
    y2: y + height,
    width,
    color,
  };
}

export interface SpanStyle {
  /** Length of the hook down at the end ("- - -┐"); no hook when the span goes on. */
  readonly hook?: number;
  readonly color: string;
}

/** The dashed line of a sustained effect ("P.M. - - -┐"), empty when too short to see. */
export function dashedSpan(
  x1: number,
  x2: number,
  y: number,
  style: SpanStyle,
): LineCommand[] {
  if (x2 - x1 < DASH.minLength) {
    return [];
  }
  const dashes: LineCommand = {
    kind: 'line',
    x1,
    y1: y,
    x2,
    y2: y,
    width: DASH.width,
    color: style.color,
    dash: DASH.pattern,
  };
  if (style.hook === undefined) {
    return [dashes];
  }
  return [
    dashes,
    {
      kind: 'line',
      x1: x2,
      y1: y,
      x2,
      y2: y + style.hook,
      width: DASH.width,
      color: style.color,
    },
  ];
}

/** Estimated advance of a system-font label. */
export function textWidth(text: string, size: number): number {
  return text.length * size * CHAR_WIDTH;
}
