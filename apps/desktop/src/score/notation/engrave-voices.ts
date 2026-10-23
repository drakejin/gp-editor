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
import { graceNotes } from './grace';
import { strokes, tremoloStrokes, trills, vibratos } from './ornaments';
import { ottavaMarks } from './ottava';
import { pickStrokes } from './pick-strokes';
import { rest } from './rests';
import { legatoMarks } from './slurs';
import { ties } from './ties';
import { tupletGroups, tupletMarks } from './tuplets';
import type { VoiceLayout } from './voice-layout';

export interface Highlight {
  readonly beatIndex: number;
  readonly string?: number;
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
}

function isHighlighted(
  highlight: Highlight | undefined,
  event: VoiceEvent,
  note?: StaffNote,
): boolean {
  return (
    highlight !== undefined &&
    highlight.beatIndex === event.beatIndex &&
    (highlight.string === undefined || highlight.string === note?.string)
  );
}

function engraveChord(
  chord: Chord,
  context: VoicesContext,
  isFlagged: boolean,
): DrawCommand[] {
  const { top, palette, highlight } = context;
  const colorOf = (note: StaffNote) =>
    isHighlighted(highlight, chord.event, note) ? palette.accent : palette.text;
  return [
    ...ledgerLines(chord, top, palette.line),
    ...accidentals(chord, palette.text),
    ...noteheads(chord, colorOf),
    ...dots(chord, top, palette.text, isFlagged && chord.direction === 'up'),
  ];
}

function engraveRests(
  layout: VoiceLayout,
  context: VoicesContext,
): DrawCommand[] {
  const { highlight, palette, top } = context;
  return layout.events.flatMap((event, index) =>
    layout.chords[index] === undefined
      ? rest(
          event,
          layout.isMultiVoice,
          top,
          isHighlighted(highlight, event) ? palette.accent : palette.text,
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

/** Notes, rests, stems, beams, flags, tuplets, ties, ottava marks and playing techniques of a measure's voices. */
export function engraveVoices(
  placed: readonly VoiceEvent[],
  context: VoicesContext,
): DrawCommand[] {
  const isMultiVoice = placed.some(event => event.voiceIndex > 0);
  const events = isMultiVoice ? separateVoices(placed) : placed;
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
  const ink = context.palette.text;
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
        : engraveChord(chord, context, flagged.has(chord.eventIndex)),
    ),
    ...stems(chords, tips, ink),
    ...beamed.flatMap(group => beamPolygons(group, ink)),
    ...flags(chords, tips, flagged, ink),
    ...engraveRests(layout, context),
    ...tupletGroups(events).flatMap(group =>
      tupletMarks(group, layout, beamed),
    ),
    ...ties(layout),
    ...ottavaMarks(events, chords, context.top, ink),
    ...techniques(layout),
    ...(context.showsPickStrokes === true ? pickStrokes(layout) : []),
  ];
}
