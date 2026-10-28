/**
 * Drawing commands for the native score canvas (`GPScoreCanvas`, macos/GPEditor-macOS/GPScoreCanvasComponentView.mm).
 * Engravers (tab, notation, fretboard) are pure functions that return these; the canvas draws a whole row with
 * CoreGraphics, so the score costs one native view per row instead of one per glyph.
 *
 * Coordinates are points, origin top-left of the canvas. Colors are CSS hex strings (#RRGGBB or #RRGGBBAA).
 */

/** `ui` = system font, `mono` = Menlo (fret numbers), `music` = Bravura, a SMuFL music font (clefs, noteheads, rests …). */
export type DrawFont = 'ui' | 'mono' | 'music';

export type DrawAlign = 'left' | 'center' | 'right';

export interface LineCommand {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly color: string;
  /** Dash pattern in points (on, off, …), e.g. [3, 3] for "let ring ----". Solid when absent. */
  readonly dash?: readonly number[];
}

/** Filled rectangle, optionally with rounded corners. */
export interface RectCommand {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly radius?: number;
}

/** Filled circle, or an outline when `strokeWidth` is set. */
export interface CircleCommand {
  readonly kind: 'circle';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly strokeWidth?: number;
}

/**
 * Text. For `music` the y is the glyph baseline, as SMuFL places glyphs (a notehead's baseline is its staff position);
 * for `ui` and `mono` the y is the vertical centre of the text.
 */
export interface TextCommand {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly size: number;
  readonly color: string;
  readonly font: DrawFont;
  readonly align: DrawAlign;
  readonly bold?: boolean;
  /** Slanted (the stylesheet's italic texts). */
  readonly italic?: boolean;
  /** A font family installed on the Mac, in place of the system font (`ui` texts the stylesheet sets a font for). */
  readonly family?: string;
}

/** Quadratic Bézier stroke (ties, slurs, bend arrows). */
export interface CurveCommand {
  readonly kind: 'curve';
  readonly x1: number;
  readonly y1: number;
  readonly cx: number;
  readonly cy: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly color: string;
}

/** Filled polygon; `points` is [x0, y0, x1, y1, …] (slanted beams). */
export interface PolygonCommand {
  readonly kind: 'polygon';
  readonly points: readonly number[];
  readonly color: string;
}

export type DrawCommand =
  | LineCommand
  | RectCommand
  | CircleCommand
  | TextCommand
  | CurveCommand
  | PolygonCommand;

/**
 * Where commands go: moved by (dx, dy), scaled about the origin by `scale` (sizes and strokes too), then moved by (x, y).
 * translateCommands and scaleCommands are its halves; the PDF places a staff on its page with all of it in one pass.
 */
export interface Placement {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Shift every command by (dx, dy) — used to place a measure's commands in its row. */
export function translateCommands(commands: readonly DrawCommand[], dx: number, dy: number): DrawCommand[] {
  return placeCommands(commands, { dx, dy, scale: 1, x: 0, y: 0 });
}

/** Scale every command about the origin by `factor`, sizes and stroke widths too — used to print rows smaller than on screen. */
export function scaleCommands(commands: readonly DrawCommand[], factor: number): DrawCommand[] {
  return placeCommands(commands, { dx: 0, dy: 0, scale: factor, x: 0, y: 0 });
}

/**
 * Every command where `placement` puts it. Each is built as a literal, key by key in the order the engravers write
 * them (the canvas's JSON stays the same): an object spread per command — Object.assign once compiled — costs about
 * three times as much in Hermes, and every command of a row or a PDF page is moved more than once.
 */
export function placeCommands(commands: readonly DrawCommand[], placement: Placement): DrawCommand[] {
  return commands.map((command) => placeCommand(command, placement));
}

function placeX(value: number, p: Placement): number {
  return (value + p.dx) * p.scale + p.x;
}

function placeY(value: number, p: Placement): number {
  return (value + p.dy) * p.scale + p.y;
}

function placeCommand(command: DrawCommand, p: Placement): DrawCommand {
  switch (command.kind) {
    case 'line':
      return placeLine(command, p);
    case 'curve':
      return {
        kind: 'curve', x1: placeX(command.x1, p), y1: placeY(command.y1, p), cx: placeX(command.cx, p), cy: placeY(command.cy, p),
        x2: placeX(command.x2, p), y2: placeY(command.y2, p), width: command.width * p.scale, color: command.color,
      };
    case 'polygon':
      return { kind: 'polygon', points: command.points.map((value, i) => (i % 2 === 0 ? placeX(value, p) : placeY(value, p))), color: command.color };
    case 'rect':
      return placeRect(command, p);
    case 'circle':
      return placeCircle(command, p);
    case 'text':
      return placeText(command, p);
  }
}

function placeLine(line: LineCommand, p: Placement): LineCommand {
  const x1 = placeX(line.x1, p);
  const y1 = placeY(line.y1, p);
  const x2 = placeX(line.x2, p);
  const y2 = placeY(line.y2, p);
  const width = line.width * p.scale;
  return line.dash === undefined
    ? { kind: 'line', x1, y1, x2, y2, width, color: line.color }
    : { kind: 'line', x1, y1, x2, y2, width, color: line.color, dash: line.dash.map((length) => length * p.scale) };
}

function placeRect(rect: RectCommand, p: Placement): RectCommand {
  const x = placeX(rect.x, p);
  const y = placeY(rect.y, p);
  const width = rect.width * p.scale;
  const height = rect.height * p.scale;
  return rect.radius === undefined
    ? { kind: 'rect', x, y, width, height, color: rect.color }
    : { kind: 'rect', x, y, width, height, color: rect.color, radius: rect.radius * p.scale };
}

function placeCircle(circle: CircleCommand, p: Placement): CircleCommand {
  const x = placeX(circle.x, p);
  const y = placeY(circle.y, p);
  const radius = circle.radius * p.scale;
  return circle.strokeWidth === undefined
    ? { kind: 'circle', x, y, radius, color: circle.color }
    : { kind: 'circle', x, y, radius, color: circle.color, strokeWidth: circle.strokeWidth * p.scale };
}

/** A text's style keys (bold, italic, family) are kept when it has any; an unset one is left out of the JSON. */
function placeText(text: TextCommand, p: Placement): TextCommand {
  const x = placeX(text.x, p);
  const y = placeY(text.y, p);
  const size = text.size * p.scale;
  return text.bold === undefined && text.italic === undefined && text.family === undefined
    ? { kind: 'text', x, y, text: text.text, size, color: text.color, font: text.font, align: text.align }
    : { kind: 'text', x, y, text: text.text, size, color: text.color, font: text.font, align: text.align, bold: text.bold, italic: text.italic, family: text.family };
}

/** SMuFL code points used by the engravers (Bravura). https://w3c.github.io/smufl/latest/ */
export const SMUFL = {
  gClef: '',
  gClef8vb: '',
  fClef: '',
  fClef8vb: '',
  cClef: '',
  cClef8vb: '',
  unpitchedPercussionClef: '',
  sixStringTabClef: '',
  fourStringTabClef: '',
  timeSigDigit0: 0xe080,
  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',
  noteheadXBlack: '',
  // Drum noteheads and symbols of Guitar Pro's drum kit (gp-core drumNotation), in SMuFL's names.
  noteheadXHalf: '\uE0A8',
  noteheadXWhole: '\uE0A7',
  noteheadNull: '\uE0A5',
  noteheadCircleX: '\uE0B3',
  noteheadCircleSlash: '\uE0F7',
  noteheadDiamondWhite: '\uE0DD',
  noteheadHeavyX: '\uE0F8',
  noteheadHeavyXHat: '\uE0F9',
  noteheadTriangleUpBlack: '\uE0BE',
  noteheadTriangleUpHalf: '\uE0BC',
  noteheadTriangleUpWhole: '\uE0BB',
  noteheadSlashedBlack2: '\uE0D0',
  noteheadParenthesis: '\uE0CE',
  pictEdgeOfCymbal: '\uE729',
  guitarGolpe: '\uE842',
  augmentationDot: '',
  flagUp: ['', '', '', ''],
  flagDown: ['', '', '', ''],
  accidentalFlat: '',
  accidentalNatural: '',
  accidentalSharp: '',
  restWhole: '',
  restHalf: '',
  restQuarter: '',
  rest8th: '',
  rest16th: '',
  rest32nd: '',
  rest64th: '',
} as const;

const REST_GLYPHS: Readonly<Record<number, string>> = {
  1: SMUFL.restWhole,
  2: SMUFL.restHalf,
  4: SMUFL.restQuarter,
  8: SMUFL.rest8th,
  16: SMUFL.rest16th,
  32: SMUFL.rest32nd,
  64: SMUFL.rest64th,
};

/** The rest of a note value (1 = whole … 64); a quarter rest for any other. */
export function restGlyph(noteValue: number): string {
  return REST_GLYPHS[noteValue] ?? SMUFL.restQuarter;
}
