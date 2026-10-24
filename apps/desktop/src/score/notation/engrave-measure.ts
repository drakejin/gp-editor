import type { Measure, MeasureHeader, Track } from '@gp-editor/core';
import { type MeasureLayout, TAB } from '../../lib/layout';
import type { Palette } from '../../theme';
import type { DrawCommand } from '../draw';
import { type Highlight, engraveVoices } from './engrave-voices';
import { buildVoiceEvents } from './events';
import { keyChange } from './key-signature';
import { type ClefKind, clefKind } from './pitch';
import { measureRest } from './rests';
import { barLines, staffLines, timeSignature } from './staff';

export interface NotationContext {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** For key changes, and ties, slurs and slides arriving across the bar line. */
  readonly previousMeasure?: Measure;
  /** For ties, slurs and slides leaving across the bar line (half arcs to the right edge, e.g. at the end of a row). */
  readonly nextMeasure?: Measure;
  /** y of the staff's top line, in measure-local coordinates (x = 0 is the measure's left edge). */
  readonly top: number;
  readonly palette: Palette;
  /** Cursor or playing beat: its noteheads (only the note on `string` when given) are drawn in palette.accent. */
  readonly highlight?: Highlight;
  /** Pick strokes above the staff; the row turns this on when no tab staff shows them. */
  readonly showsPickStrokes?: boolean;
  /** A piano or organ track (`isKeyboardTrack`): fingering is written 1–5. */
  readonly isKeyboard?: boolean;
}

function keyChangeCommands(
  context: NotationContext,
  clef: ClefKind,
): DrawCommand[] {
  const x = context.layout.keySignatureX;
  if (x === undefined) {
    return [];
  }
  const previousKey = context.previousMeasure?.keySignature ?? 0;
  return keyChange(previousKey, context.measure.keySignature, clef, {
    x,
    top: context.top,
    advance: TAB.keyAccidentalWidth,
    color: context.palette.text,
  });
}

/** Where the beat area starts: after the repeat sign, key change and time signature that layoutMeasure placed. */
function beatAreaStart(context: NotationContext): number {
  const { layout, header, measure, previousMeasure } = context;
  const changedKey =
    measure.keySignature === 0
      ? previousMeasure?.keySignature ?? 0
      : measure.keySignature;
  const keyEnd =
    layout.keySignatureX === undefined
      ? 0
      : layout.keySignatureX +
        Math.abs(changedKey) * TAB.keyAccidentalWidth +
        TAB.keySignaturePadding;
  const timeEnd =
    layout.timeSignatureX === undefined
      ? 0
      : layout.timeSignatureX + TAB.timeSignatureWidth;
  return Math.max(
    TAB.padLeft + (header.repeatOpen ? TAB.repeatWidth : 0),
    keyEnd,
    timeEnd,
  );
}

/** One measure of the standard-notation staff: staff and bar lines, key / time signature changes, voices. */
export function engraveNotationMeasure(
  context: NotationContext,
): DrawCommand[] {
  const { track, header, measure, layout, top, palette } = context;
  const clef = clefKind(track, measure.clef);
  const timeSignatureX = layout.showTimeSignature
    ? layout.timeSignatureX
    : undefined;
  const start = beatAreaStart(context);
  // Ties and slurs from the previous measure start at the bar line, or after a key / time signature drawn there.
  const entryX = start > TAB.padLeft ? start : 0;
  const voices =
    measure.beats.length === 0
      ? [measureRest((start + layout.width) / 2, top, palette.text)]
      : engraveVoices(buildVoiceEvents(track, measure, layout, clef), {
          ...context,
          width: layout.width,
          entryX,
        });
  return [
    ...staffLines(0, layout.width, top, palette.line),
    ...barLines(header, layout.width, top, palette.text),
    ...keyChangeCommands(context, clef),
    ...(timeSignatureX === undefined
      ? []
      : timeSignature(header, timeSignatureX, top, palette.text)),
    ...voices,
  ];
}
