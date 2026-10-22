import type { Beat, Measure, StrokeDirection } from '@gp-editor/core';
import type { MeasureLayout } from '../../lib/layout';
import type { Palette } from '../../theme';
import type { TextCommand } from '../draw';
import { type MusicGlyph, PICK_STROKE_GLYPHS, staffSpace } from './smufl';

/** Pick strokes (down / up picking), drawn as Guitar Pro does with the bowing marks of string players. */

/** Music size of the marks in the tab's marks row: the up-bow mark, two staff spaces tall, fits one lane. */
export const TAB_PICK_STROKE_SIZE = 20;

export function hasPickStroke(beat: Beat | undefined): boolean {
  return beat !== undefined && beat.pickStroke !== 'none';
}

export function pickStrokeGlyph(direction: StrokeDirection): MusicGlyph | undefined {
  return direction === 'none' ? undefined : PICK_STROKE_GLYPHS[direction];
}

export interface TabPickStrokesContext {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  readonly palette: Palette;
}

/** The pick strokes of a measure in their lane above the tab: centred over each beat, ink centred on the lane's `y`. */
export function tabPickStrokes(context: TabPickStrokesContext, y: number): TextCommand[] {
  const space = staffSpace(TAB_PICK_STROKE_SIZE);
  return context.layout.beats.flatMap((beatLayout): TextCommand[] => {
    const glyph = pickStrokeGlyph(context.measure.beats[beatLayout.beatIndex]?.pickStroke ?? 'none');
    if (glyph === undefined) {
      return [];
    }
    const baseline = y + ((glyph.top + glyph.bottom) / 2) * space;
    return [
      { kind: 'text', x: beatLayout.x, y: baseline, text: glyph.text, size: TAB_PICK_STROKE_SIZE, color: context.palette.muted, font: 'music', align: 'center' },
    ];
  });
}
