import { type Measure, type MeasureHeader, isPedalDownBefore, measureTicks } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { MARK_GLYPHS, staffSpace } from './symbols/smufl';

/**
 * The sustain pedal under the staves, as piano music marks it: "Ped." where it goes down, a line while it is held,
 * "✱" where it comes up. Its band is there only for a track with pedal marks (`hasPedals`).
 */

/** Music size of the marks (one em = four staff spaces). */
export const PEDAL_MUSIC_SIZE = 20;
/** The line held under the bar; "Ped." starts a little left of its beat. */
const LINE = { width: 1, gap: 2, raise: 1, inset: 4 } as const;

export function hasPedals(measures: readonly Measure[]): boolean {
  return measures.some((measure) => (measure.pedals?.length ?? 0) > 0);
}

/** x of a place in the measure (ticks from its start): between the beats' columns, the bar's end for its length. */
export function pedalX(measure: Measure, header: MeasureHeader, layout: MeasureLayout, offset: number): number {
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const columns = layout.beats.flatMap((beatLayout) => {
    const beat = measure.beats[beatLayout.beatIndex];
    return beat === undefined ? [] : [{ offset: beat.start - header.start, x: beatLayout.x }];
  });
  const points = [...(columns[0]?.offset === 0 ? [] : [{ offset: 0, x: columns[0]?.x ?? 0 }]), ...columns, { offset: length, x: layout.width }];
  const after = points.findIndex((point) => point.offset >= offset);
  const right = points[after] ?? points[points.length - 1];
  const left = points[after - 1];
  if (right === undefined || left === undefined || right.offset === left.offset) {
    return right?.x ?? 0;
  }
  return left.x + ((right.x - left.x) * (offset - left.offset)) / (right.offset - left.offset);
}

export interface PedalsContext {
  readonly measures: readonly Measure[];
  readonly measureIndex: number;
  readonly header: MeasureHeader;
  readonly layout: MeasureLayout;
  /** Baseline of the marks. */
  readonly y: number;
  readonly palette: Palette;
}

/** The measure's pedal marks and the lines while the pedal is held (measure-local coordinates). */
export function engravePedals(context: PedalsContext): DrawCommand[] {
  const { measures, measureIndex, header, layout, y, palette } = context;
  const measure = measures[measureIndex];
  if (measure === undefined) {
    return [];
  }
  const space = staffSpace(PEDAL_MUSIC_SIZE);
  const ped = MARK_GLYPHS.keyboardPedalPed;
  const up = MARK_GLYPHS.keyboardPedalUp;
  const line = (x1: number, x2: number): DrawCommand[] => (x2 > x1 ? [{ kind: 'line', x1, y1: y - LINE.raise, x2, y2: y - LINE.raise, width: LINE.width, color: palette.text }] : []);
  const glyph = (text: string, x: number): DrawCommand => ({ kind: 'text', x, y, text, size: PEDAL_MUSIC_SIZE, color: palette.text, font: 'music', align: 'left' });
  const start = { lineFrom: isPedalDownBefore(measures, measureIndex) ? 0 : undefined, commands: [] as readonly DrawCommand[] };
  const drawn = (measure.pedals ?? []).reduce((state, mark) => {
    const x = pedalX(measure, header, layout, mark.offset);
    if (mark.action === 'up') {
      const left = x - (up.advance * space) / 2;
      const held = state.lineFrom === undefined ? [] : line(state.lineFrom, left - LINE.gap);
      return { lineFrom: undefined, commands: [...state.commands, ...held, glyph(up.text, left)] };
    }
    const left = x - LINE.inset;
    return { lineFrom: left + ped.advance * space + LINE.gap, commands: [...state.commands, glyph(ped.text, left)] };
  }, start);
  return drawn.lineFrom === undefined ? [...drawn.commands] : [...drawn.commands, ...line(drawn.lineFrom, layout.width)];
}
