// Draws the DrawCommand list of src/score/draw.ts on a 2D canvas: the Windows build's GPCommandPainter.m. Coordinates
// are points, origin top-left, y down; the canvas is scaled for the screen's pixels (or the PNG's resolution) first.
import type { CircleCommand, CurveCommand, DrawCommand, LineCommand, PolygonCommand, RectCommand, TextCommand } from '../../score/draw';
import { cssFont } from './fonts';

export interface PaintOptions {
  /** Rectangles of this colour ("#RRGGBB", any case) erase instead of painting (a transparent PNG's paper); '' for none. */
  readonly eraseColor?: string;
}

/** "#RRGGBB" or "#RRGGBBAA" as a CSS colour (the alpha byte last, as in draw.ts). */
export function cssColor(hex: string): string {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  if (digits.length !== 8) {
    return `#${digits}`;
  }
  const alpha = parseInt(digits.slice(6, 8), 16) / 255;
  return `rgba(${parseInt(digits.slice(0, 2), 16)}, ${parseInt(digits.slice(2, 4), 16)}, ${parseInt(digits.slice(4, 6), 16)}, ${alpha.toFixed(3)})`;
}

function drawLine(context: CanvasRenderingContext2D, c: LineCommand): void {
  context.strokeStyle = cssColor(c.color);
  context.lineWidth = c.width;
  context.setLineDash(c.dash !== undefined && c.dash.length > 0 && c.dash.length <= 8 ? [...c.dash] : []);
  context.beginPath();
  context.moveTo(c.x1, c.y1);
  context.lineTo(c.x2, c.y2);
  context.stroke();
  context.setLineDash([]);
}

function fillRect(context: CanvasRenderingContext2D, c: RectCommand, eraseColor: string): void {
  const isErasing = eraseColor !== '' && c.color.toLowerCase() === eraseColor.toLowerCase();
  const radius = Math.min(c.radius ?? 0, Math.min(c.width, c.height) / 2);
  if (isErasing) {
    context.save();
    context.globalCompositeOperation = 'destination-out';
  }
  context.fillStyle = isErasing ? '#000000' : cssColor(c.color);
  context.beginPath();
  if (radius > 0) {
    context.roundRect(c.x, c.y, c.width, c.height, radius);
  } else {
    context.rect(c.x, c.y, c.width, c.height);
  }
  context.fill();
  if (isErasing) {
    context.restore();
  }
}

function drawCircle(context: CanvasRenderingContext2D, c: CircleCommand): void {
  context.beginPath();
  context.arc(c.x, c.y, Math.max(0, c.radius), 0, Math.PI * 2);
  if (c.strokeWidth !== undefined) {
    context.strokeStyle = cssColor(c.color);
    context.lineWidth = c.strokeWidth;
    context.stroke();
  } else {
    context.fillStyle = cssColor(c.color);
    context.fill();
  }
}

function drawCurve(context: CanvasRenderingContext2D, c: CurveCommand): void {
  context.strokeStyle = cssColor(c.color);
  context.lineWidth = c.width;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(c.x1, c.y1);
  context.quadraticCurveTo(c.cx, c.cy, c.x2, c.y2);
  context.stroke();
  context.lineCap = 'butt';
}

function drawPolygon(context: CanvasRenderingContext2D, c: PolygonCommand): void {
  const { points } = c;
  if (points.length < 6) {
    return;
  }
  context.fillStyle = cssColor(c.color);
  context.beginPath();
  context.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (let i = 2; i + 1 < points.length; i += 2) {
    context.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
  }
  context.closePath();
  context.fill();
}

/** Music text sits on its baseline (SMuFL); UI text is centred vertically on y, as GPCommandPainter.m places it. */
function drawText(context: CanvasRenderingContext2D, c: TextCommand): void {
  context.font = cssFont(c.font, c.size, c.bold === true);
  context.fillStyle = cssColor(c.color);
  context.textAlign = c.align;
  context.textBaseline = 'alphabetic';
  if (c.font === 'music') {
    context.fillText(c.text, c.x, c.y);
    return;
  }
  const metrics = context.measureText(c.text);
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  context.fillText(c.text, c.x, c.y - (ascent + descent) / 2 + ascent);
}

/** Draws the commands in order onto the context (already scaled to points). */
export function paintCommands(context: CanvasRenderingContext2D, commands: readonly DrawCommand[], options: PaintOptions = {}): void {
  const eraseColor = options.eraseColor ?? '';
  for (const command of commands) {
    switch (command.kind) {
      case 'line':
        drawLine(context, command);
        break;
      case 'rect':
        fillRect(context, command, eraseColor);
        break;
      case 'circle':
        drawCircle(context, command);
        break;
      case 'text':
        drawText(context, command);
        break;
      case 'curve':
        drawCurve(context, command);
        break;
      case 'polygon':
        drawPolygon(context, command);
        break;
    }
  }
}
