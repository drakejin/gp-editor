import type { DrawCommand } from './draw';
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
