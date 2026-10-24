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

/** Shift every command by (dx, dy) — used to place a measure's commands in its row. */
export function translateCommands(
  commands: readonly DrawCommand[],
  dx: number,
  dy: number,
): DrawCommand[] {
  return commands.map(command => translateCommand(command, dx, dy));
}

function translateCommand(
  command: DrawCommand,
  dx: number,
  dy: number,
): DrawCommand {
  switch (command.kind) {
    case 'line':
      return {
        ...command,
        x1: command.x1 + dx,
        y1: command.y1 + dy,
        x2: command.x2 + dx,
        y2: command.y2 + dy,
      };
    case 'curve':
      return {
        ...command,
        x1: command.x1 + dx,
        y1: command.y1 + dy,
        cx: command.cx + dx,
        cy: command.cy + dy,
        x2: command.x2 + dx,
        y2: command.y2 + dy,
      };
    case 'polygon':
      return {
        ...command,
        points: command.points.map(
          (value, i) => value + (i % 2 === 0 ? dx : dy),
        ),
      };
    case 'rect':
    case 'circle':
    case 'text':
      return { ...command, x: command.x + dx, y: command.y + dy };
  }
}

/** Scale every command about the origin by `factor`, sizes and stroke widths too — used to print rows smaller than on screen. */
export function scaleCommands(commands: readonly DrawCommand[], factor: number): DrawCommand[] {
  return commands.map((command) => scaleCommand(command, factor));
}

function scaleCommand(command: DrawCommand, factor: number): DrawCommand {
  const scale = (value: number) => value * factor;
  switch (command.kind) {
    case 'line':
      return {
        ...command, x1: scale(command.x1), y1: scale(command.y1), x2: scale(command.x2), y2: scale(command.y2), width: scale(command.width),
        ...(command.dash === undefined ? {} : { dash: command.dash.map(scale) }),
      };
    case 'curve':
      return {
        ...command, x1: scale(command.x1), y1: scale(command.y1), cx: scale(command.cx), cy: scale(command.cy),
        x2: scale(command.x2), y2: scale(command.y2), width: scale(command.width),
      };
    case 'polygon':
      return { ...command, points: command.points.map(scale) };
    case 'rect':
      return {
        ...command, x: scale(command.x), y: scale(command.y), width: scale(command.width), height: scale(command.height),
        ...(command.radius === undefined ? {} : { radius: scale(command.radius) }),
      };
    case 'circle':
      return {
        ...command, x: scale(command.x), y: scale(command.y), radius: scale(command.radius),
        ...(command.strokeWidth === undefined ? {} : { strokeWidth: scale(command.strokeWidth) }),
      };
    case 'text':
      return { ...command, x: scale(command.x), y: scale(command.y), size: scale(command.size) };
  }
}

/** SMuFL code points used by the engravers (Bravura). https://w3c.github.io/smufl/latest/ */
export const SMUFL = {
  gClef: '',
  gClef8vb: '',
  fClef: '',
  fClef8vb: '',
  cClef8vb: '',
  unpitchedPercussionClef: '',
  sixStringTabClef: '',
  fourStringTabClef: '',
  timeSigDigit0: 0xe080,
  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',
  noteheadXBlack: '',
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
