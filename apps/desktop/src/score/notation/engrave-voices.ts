import type { Measure, MeasureHeader } from '@gp-editor/core';
import type { Palette } from '../../theme';
import type { DrawCommand } from '../draw';
import { articulations } from './articulations';
import {
  beamChords,
  beamGroups,
  beamPolygons,
  flaggedChords,
  flags,
  stemDirections,
  stemTips,
  stems,
} from './beams';
import {
  type Chord,
  accidentals,
  dots,
  layoutChord,
  ledgerLines,
  noteheads,
} from './chords';
import { separateVoices } from './collisions';
import type { StaffNote, VoiceEvent } from './events';
import { fingerings } from './fingering';
import { graceNotes } from './grace';
import { strokes, tremoloStrokes, trills, vibratos } from './ornaments';
import { ottavaMarks } from './ottava';
import { pickStrokes } from './pick-strokes';
import { rest } from './rests';
import { legatoMarks } from './slurs';
import { ties } from './ties';
import { tupletGroups, tupletMarks } from './tuplets';
import type { VoiceLayout } from './voice-layout';
import { voiceTint } from '../voices';

export interface Highlight {
  readonly beatIndex: number;
  readonly string?: number;
  /** The cursor's voice: only its note is lit, in the voice's colour; every voice's notes when absent (the playing beat). */
  readonly voiceIndex?: number;
}

export interface VoicesContext {
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  readonly top: number;
  /** Measure width: the bar line on the right. */
  readonly width: number;
  /** Where ties and slurs from the previous measure start (0, or after a key / time signature). */
  readonly entryX: number;
  readonly palette: Palette;
  readonly highlight?: Highlight;
  /** Pick strokes above the staff (when no tab staff shows them). */
  readonly showsPickStrokes?: boolean;
  /** A piano or organ track: fingers are written 1–5 (piano fingering). */
  readonly isKeyboard?: boolean;
  /** The measure starts its row: an octave sign running into it is named again. */
  readonly isRowStart?: boolean;
  /** The voice being edited (the cursor's): the other voices are drawn faded, as Guitar Pro 8 does. */
  readonly editedVoiceIndex?: number;
}

function isHighlighted(
  highlight: Highlight | undefined,
  event: VoiceEvent,
  note?: StaffNote,
): boolean {
  return (
    highlight !== undefined &&
    highlight.beatIndex === event.beatIndex &&
    (highlight.voiceIndex === undefined || highlight.voiceIndex === event.voiceIndex) &&
    (highlight.string === undefined || highlight.string === note?.string)
  );
}

/** The lit colour: the cursor's voice's colour (the accent in voice 1), the accent at the playing beat. */
function litColor(context: VoicesContext): string {
  const voiceIndex = context.highlight?.voiceIndex;
  return voiceIndex === undefined
    ? context.palette.accent
    : voiceTint(voiceIndex, context.palette);
}

function engraveChord(
  chord: Chord,
  context: VoicesContext,
  isFlagged: boolean,
  ink: string,
): DrawCommand[] {
  const { top, palette, highlight } = context;
  // A slash stands for every note of its beat: it lights whatever string the cursor is on.
  const isLit = (note: StaffNote) =>
    note.isSlash === true
      ? isHighlighted(
          highlight === undefined ? undefined : { ...highlight, string: undefined },
          chord.event,
        )
      : isHighlighted(highlight, chord.event, note);
  const colorOf = (note: StaffNote) => (isLit(note) ? litColor(context) : ink);
  return [
    ...ledgerLines(chord, top, palette.line),
    ...accidentals(chord, ink),
    ...noteheads(chord, colorOf),
    ...dots(chord, top, ink, isFlagged && chord.direction === 'up'),
  ];
}

function engraveRests(
  layout: VoiceLayout,
  context: VoicesContext,
): DrawCommand[] {
  const { highlight, top } = context;
  return layout.events.flatMap((event, index) =>
    layout.chords[index] === undefined
      ? rest(
          event,
          layout.isMultiVoice,
          top,
          isHighlighted(highlight, event) ? litColor(context) : layout.color,
        )
      : [],
  );
}

/** Playing techniques: articulations, ornaments, grace notes, slurs, slides and strum arrows. */
function techniques(layout: VoiceLayout): DrawCommand[] {
  return [
    ...articulations(layout),
    ...tremoloStrokes(layout),
    ...trills(layout),
    ...vibratos(layout),
    ...graceNotes(layout),
    ...legatoMarks(layout),
    ...strokes(layout),
  ];
}

/**
 * Notes, rests, stems, beams, flags, tuplets, ties, ottava marks and playing techniques of a measure's voices. The
 * voices are placed together (stems, rests and noteheads apart); then the voices not being edited are drawn faded, and
 * the edited one over them.
 */
export function engraveVoices(
  placed: readonly VoiceEvent[],
  context: VoicesContext,
): DrawCommand[] {
  const isMultiVoice = placed.some(event => event.voiceIndex > 0);
  const events = isMultiVoice ? separateVoices(placed) : placed;
  const { editedVoiceIndex, palette } = context;
  const isFaded = (event: VoiceEvent) =>
    editedVoiceIndex !== undefined && event.voiceIndex !== editedVoiceIndex;
  const faded = events.filter(isFaded);
  const inked = events.filter(event => !isFaded(event));
  return [
    ...(faded.length === 0
      ? []
      : engraveVoiceEvents(faded, context, isMultiVoice, palette.muted)),
    ...(inked.length === 0
      ? []
      : engraveVoiceEvents(inked, context, isMultiVoice, palette.text)),
  ];
}

/** Some voices of the measure, already placed against the others, drawn in one ink. */
function engraveVoiceEvents(
  events: readonly VoiceEvent[],
  context: VoicesContext,
  isMultiVoice: boolean,
  ink: string,
): DrawCommand[] {
  const groups = beamGroups(events, context.header);
  const directions = stemDirections(events, groups, isMultiVoice);
  const chords = events.map((event, index) =>
    event.notes.length === 0
      ? undefined
      : layoutChord(event, index, directions[index] ?? 'up', context.top),
  );
  const beamed = beamChords(groups, chords);
  const tips = stemTips(chords, beamed);
  const flagged = flaggedChords(chords, beamed);
  const layout: VoiceLayout = {
    ...context,
    events,
    chords,
    tips,
    isMultiVoice,
    color: ink,
  };
  return [
    ...chords.flatMap(chord =>
      chord === undefined
        ? []
        : engraveChord(chord, context, flagged.has(chord.eventIndex), ink),
    ),
    ...stems(chords, tips, ink),
    ...beamed.flatMap(group => beamPolygons(group, ink)),
    ...flags(chords, tips, flagged, ink),
    ...engraveRests(layout, context),
    ...tupletGroups(events).flatMap(group =>
      tupletMarks(group, layout, beamed),
    ),
    ...ties(layout),
    ...ottavaMarks(events, chords, context.top, ink, context),
    ...techniques(layout),
    ...fingerings(layout, context.isKeyboard === true),
    ...(context.showsPickStrokes === true ? pickStrokes(layout) : []),
  ];
}
