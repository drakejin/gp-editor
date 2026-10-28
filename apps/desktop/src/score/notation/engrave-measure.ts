import type { Measure, MeasureHeader, Track } from '@gp-editor/core';
import { type MeasureLayout, TAB } from '../../lib/layout';
import type { Palette } from '../../theme';
import type { DrawCommand } from '../draw';
import type { NextInRow } from '../symbols/links';
import { type Highlight, engraveVoices } from './engrave-voices';
import { buildVoiceEvents } from './events';
import { keyChange } from './key-signature';
import { CLEF_CHANGE_SCALE, MUSIC_FONT_SIZE, positionY } from './metrics';
import { type ClefKind, clefKind } from './pitch';
import { emptyVoiceRest, measureRest } from './rests';
import { voiceTint } from '../voices';
import { CLEF_GLYPHS, barLines, staffLines, timeSignature } from './staff';
import { type HeadLookup, nextMeasureHeads } from './voice-placement';

export interface NotationContext {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  /** For key changes, and ties, slurs and slides arriving across the bar line. */
  readonly previousMeasure?: Measure;
  /** For ties, slurs and slides leaving across the bar line (half arcs to the right edge, e.g. at the end of a row). */
  readonly nextMeasure?: Measure;
  /** The next measure when it is on this row too: slurs and slides into it are drawn whole, notehead to notehead. */
  readonly nextInRow?: NextInRow;
  /** y of the staff's top line, in measure-local coordinates (x = 0 is the measure's left edge). */
  readonly top: number;
  readonly palette: Palette;
  /** Cursor or playing beat: its noteheads (only the note on `string` when given) are drawn in palette.accent. */
  readonly highlight?: Highlight;
  /** Pick strokes above the staff; the row turns this on when no tab staff shows them. */
  readonly showsPickStrokes?: boolean;
  /** A piano or organ track (`isKeyboardTrack`): fingering is written 1–5. */
  readonly isKeyboard?: boolean;
  /**
   * The measure starts its row: the row header shows its clef, and an octave sign running into it is named again. Slurs
   * and slides from the previous measure come in here unless this is false (the previous measure drew them whole).
   */
  readonly isRowStart?: boolean;
  /** The voice being edited (the cursor's): the other voices faded, and its whole rest where it has nothing in the bar. */
  readonly editedVoiceIndex?: number;
  /** 4/4 written C and 2/2 ¢ (the stylesheet's choice). */
  readonly showsCommonTime?: boolean;
}

/** The clef where it changes inside a row, cue size; none at a row start, whose header draws it. */
function clefChangeCommands(
  context: NotationContext,
  clef: ClefKind,
): DrawCommand[] {
  const x = context.layout.clefChangeX;
  if (x === undefined || context.isRowStart === true) {
    return [];
  }
  const glyph = CLEF_GLYPHS[clef];
  const y = positionY(context.top, glyph.position);
  return [
    {
      kind: 'text',
      x,
      y,
      text: glyph.text,
      size: MUSIC_FONT_SIZE * CLEF_CHANGE_SCALE,
      color: context.palette.text,
      font: 'music',
      align: 'left',
    },
  ];
}

/** The rest standing for the edited voice when it has no event in the bar (beats of other voices only). */
function emptyVoiceMark(
  context: NotationContext,
  start: number,
): DrawCommand[] {
  const { measure, editedVoiceIndex, layout, top, palette } = context;
  if (
    editedVoiceIndex === undefined ||
    measure.beats.length === 0 ||
    measure.beats.some(beat => beat.voices[editedVoiceIndex]?.isEmpty === false)
  ) {
    return [];
  }
  const tint = voiceTint(editedVoiceIndex, palette);
  return [emptyVoiceRest((start + layout.width) / 2, top, editedVoiceIndex, tint)];
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

/** What places the beat area of a measure: its layout, header and key, and the key before it. */
type BeatArea = Pick<NotationContext, 'layout' | 'header' | 'measure' | 'previousMeasure'>;

/** Where the beat area starts: after the repeat sign, key change and time signature that layoutMeasure placed. */
function beatAreaStart(context: BeatArea): number {
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
  const clefEnd =
    layout.clefChangeX === undefined
      ? 0
      : layout.clefChangeX + TAB.clefChangeWidth;
  return Math.max(
    TAB.padLeft + (header.repeatOpen ? TAB.repeatWidth : 0),
    keyEnd,
    timeEnd,
    clefEnd,
  );
}

/** Where a bar without beats draws its whole rest (the tab draws the cursor there): the middle of its beat area. */
export function measureRestX(context: BeatArea): number {
  return (beatAreaStart(context) + context.layout.width) / 2;
}

/** A bar without beats: its whole rest, lit in the cursor's voice colour when the cursor stands there. */
function emptyMeasureRest(context: NotationContext): DrawCommand {
  const voiceIndex = context.highlight?.voiceIndex;
  const color = voiceIndex === undefined ? context.palette.text : voiceTint(voiceIndex, context.palette);
  return measureRest(measureRestX(context), context.top, color);
}

/** The next measure's noteheads when it is on this row, for the slurs and slides that reach them. */
function nextHeadsOf(context: NotationContext): HeadLookup | undefined {
  const { track, nextMeasure, nextInRow, top, layout } = context;
  return nextMeasure === undefined || nextInRow === undefined
    ? undefined
    : nextMeasureHeads(track, nextMeasure, nextInRow, top, layout.width);
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
      ? [emptyMeasureRest(context)]
      : engraveVoices(buildVoiceEvents(track, measure, layout, clef), {
          ...context,
          width: layout.width,
          entryX,
          nextHeads: nextHeadsOf(context),
        });
  return [
    ...staffLines(0, layout.width, top, palette.line),
    ...barLines(header, layout.width, top, palette.text),
    ...clefChangeCommands(context, clef),
    ...keyChangeCommands(context, clef),
    ...(timeSignatureX === undefined
      ? []
      : timeSignature(header, timeSignatureX, top, palette.text, context.showsCommonTime)),
    ...voices,
    ...emptyVoiceMark(context, start),
  ];
}
