import type { DrawCommand } from './draw';
import { GLYPH_INK } from './symbols/glyph-ink';
import { textWidth } from './symbols/shapes';

/**
 * Rough ink extents of draw commands, so a mark placed after the notes (a dynamic under the staff) can keep clear of
 * them. Text has no metrics here, so music glyphs are taken on the large side: a notehead or accidental reaches about
 * a staff space below its baseline and either side of its x.
 */

export interface InkSpan {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** Parts of the font size a music glyph is taken to reach: below its baseline, and either side of its x. */
const MUSIC_INK = { below: 0.25, side: 0.4 } as const;

function textSpan(command: Extract<DrawCommand, { kind: 'text' }>): InkSpan {
  const { x, y, size } = command;
  if (command.font === 'music') {
    return { left: x - size * MUSIC_INK.side, right: x + size * MUSIC_INK.side, bottom: y + size * MUSIC_INK.below };
  }
  const width = textWidth(command.text, size);
  const left = command.align === 'left' ? x : command.align === 'right' ? x - width : x - width / 2;
  return { left, right: left + width, bottom: y + size / 2 };
}

export function inkSpan(command: DrawCommand): InkSpan {
  switch (command.kind) {
    case 'line':
      return { left: Math.min(command.x1, command.x2), right: Math.max(command.x1, command.x2), bottom: Math.max(command.y1, command.y2) + command.width / 2 };
    case 'rect':
      return { left: command.x, right: command.x + command.width, bottom: command.y + command.height };
    case 'circle':
      return { left: command.x - command.radius, right: command.x + command.radius, bottom: command.y + command.radius };
    case 'curve':
      // A tie or slur bulges half way towards its control point.
      return {
        left: Math.min(command.x1, command.x2), right: Math.max(command.x1, command.x2),
        bottom: Math.max(command.y1, command.y2, (command.y1 + 2 * command.cy + command.y2) / 4) + command.width / 2,
      };
    case 'polygon': {
      const xs = command.points.filter((_, i) => i % 2 === 0);
      return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.max(...command.points.filter((_, i) => i % 2 === 1)) };
    }
    case 'text':
      return textSpan(command);
  }
}

/** The lowest ink of the commands that reach into the columns `left`…`right`; undefined when none does. */
export function inkBottom(commands: readonly DrawCommand[], left: number, right: number): number | undefined {
  const bottoms = commands.map(inkSpan).filter((span) => span.right >= left && span.left <= right).map((span) => span.bottom);
  return bottoms.length === 0 ? undefined : Math.max(...bottoms);
}

/** A command's ink on all four sides. */
export interface InkBox extends InkSpan {
  readonly top: number;
}

/** A music glyph the table lacks reaches this far above and below its baseline (ems), as `inkSpan` takes it. */
const UNKNOWN_GLYPH: readonly [number, number] = [0.5, -MUSIC_INK.below];

/** How far a music text's glyphs reach above and below its baseline: Bravura's own extents (`GLYPH_INK`). */
function musicReach(text: string, size: number): { readonly up: number; readonly down: number } {
  let up = 0;
  let down = 0;
  for (const char of text) {
    const [top, bottom] = GLYPH_INK[char.codePointAt(0) ?? 0] ?? UNKNOWN_GLYPH;
    up = Math.max(up, top * size);
    down = Math.max(down, -bottom * size);
  }
  return { up, down };
}

/** Text: music glyphs by their extents from the baseline; other text half its size either side of its centre. */
function textVertical(command: Extract<DrawCommand, { kind: 'text' }>): { readonly top: number; readonly bottom: number } {
  if (command.font !== 'music') {
    return { top: command.y - command.size / 2, bottom: command.y + command.size / 2 };
  }
  const { up, down } = musicReach(command.text, command.size);
  return { top: command.y - up, bottom: command.y + down };
}

/** The topmost y a command reaches (y grows downwards). */
function topOf(command: DrawCommand): number {
  switch (command.kind) {
    case 'line':
      return Math.min(command.y1, command.y2) - command.width / 2;
    case 'rect':
      return command.y;
    case 'circle':
      return command.y - command.radius;
    case 'curve':
      return Math.min(command.y1, command.y2, (command.y1 + 2 * command.cy + command.y2) / 4) - command.width / 2;
    case 'polygon':
      return Math.min(...command.points.filter((_, i) => i % 2 === 1));
    case 'text':
      return textVertical(command).top;
  }
}

/** The command's ink box: `inkSpan`'s sides, and its top; a music glyph's bottom from its measured extent too. */
export function inkBox(command: DrawCommand): InkBox {
  const span = inkSpan(command);
  const bottom = command.kind === 'text' && command.font === 'music' ? textVertical(command).bottom : span.bottom;
  return { ...span, top: topOf(command), bottom };
}

/** The lowest y a command reaches, as `inkBox` takes it. */
function bottomOf(command: DrawCommand): number {
  return command.kind === 'text' ? textVertical(command).bottom : inkSpan(command).bottom;
}

/** The highest and lowest ink of the commands (their sides not worked out); undefined for none. */
export function inkExtent(commands: readonly DrawCommand[]): { readonly top: number; readonly bottom: number } | undefined {
  let top = Infinity;
  let bottom = -Infinity;
  for (const command of commands) {
    top = Math.min(top, topOf(command));
    bottom = Math.max(bottom, bottomOf(command));
  }
  return top === Infinity ? undefined : { top, bottom };
}
