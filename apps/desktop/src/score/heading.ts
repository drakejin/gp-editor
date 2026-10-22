import type { MeasureHeader, Rgb } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { ROW } from './geometry';

const MARKER_LEFT = 18;
/** Rough width of one marker character at 11 pt, to cut long markers at the measure's edge. */
const MARKER_CHAR_WIDTH = 6.5;
const ENDING_WIDTH = 80;

export function rgbHex(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Measure number, marker, tempo, alternate endings and repeat count above the staves (measure-local, y 0…ROW.heading).
 * The number of an over-full measure is drawn bold in the danger colour.
 */
export function engraveHeading(header: MeasureHeader, layout: MeasureLayout, palette: Palette, isOverfull = false): DrawCommand[] {
  const commands: DrawCommand[] = [
    {
      kind: 'text', x: 2, y: 8, text: String(header.number), size: 9,
      color: isOverfull ? palette.danger : palette.muted, font: 'ui', align: 'left', bold: isOverfull,
    },
  ];
  if (header.marker !== undefined) {
    const maxChars = Math.max(1, Math.floor((layout.width - MARKER_LEFT - 4) / MARKER_CHAR_WIDTH));
    const title = header.marker.title.length > maxChars ? `${header.marker.title.slice(0, maxChars - 1)}…` : header.marker.title;
    commands.push({ kind: 'text', x: MARKER_LEFT, y: 8, text: title, size: 11, color: rgbHex(header.marker.color), font: 'ui', align: 'left', bold: true });
  }
  if (layout.showTempo) {
    commands.push({ kind: 'text', x: 2, y: 21, text: `♩ = ${header.tempo}`, size: 10, color: palette.text, font: 'ui', align: 'left', bold: true });
  }
  commands.push(...endings(header.repeatAlternative, layout.width, palette));
  if (header.repeatClose > 0) {
    commands.push({ kind: 'text', x: layout.width - 2, y: ROW.heading - 10, text: `x${header.repeatClose}`, size: 10, color: palette.text, font: 'ui', align: 'right', bold: true });
  }
  return commands;
}

function endings(mask: number, width: number, palette: Palette): DrawCommand[] {
  const numbers = Array.from({ length: 8 }, (_, bit) => bit).filter((bit) => (mask & (1 << bit)) !== 0).map((bit) => bit + 1);
  if (numbers.length === 0) {
    return [];
  }
  const y = ROW.heading - 4;
  const right = Math.min(width - 4, ENDING_WIDTH);
  return [
    { kind: 'line', x1: 0, y1: y, x2: right, y2: y, width: 1, color: palette.text },
    { kind: 'line', x1: 0, y1: y, x2: 0, y2: y + 8, width: 1, color: palette.text },
    { kind: 'text', x: 4, y: y - 7, text: `${numbers.join(', ')}.`, size: 10, color: palette.text, font: 'ui', align: 'left' },
  ];
}
