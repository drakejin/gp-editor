import type { Measure, MeasureHeader } from '@gp-editor/core';
import type { Palette } from '../../theme';
import type { DrawCommand } from '../draw';
import { beamChords, beamGroups, beamPolygons, flaggedChords, flags, stemDirections, stemTips, stems } from './beams';
import { type Chord, accidentals, dots, layoutChord, ledgerLines, noteheads } from './chords';
import type { StaffNote, VoiceEvent } from './events';
import { ottavaMarks } from './ottava';
import { rest } from './rests';
import { ties } from './ties';
import { tupletGroups, tupletNumber } from './tuplets';

export interface Highlight {
  readonly beatIndex: number;
  readonly string?: number;
}

export interface VoicesContext {
  readonly header: MeasureHeader;
  readonly previousMeasure?: Measure;
  readonly top: number;
  readonly palette: Palette;
  readonly highlight?: Highlight;
}

function isHighlighted(highlight: Highlight | undefined, event: VoiceEvent, note?: StaffNote): boolean {
  return highlight !== undefined && highlight.beatIndex === event.beatIndex && (highlight.string === undefined || highlight.string === note?.string);
}

function engraveChord(chord: Chord, context: VoicesContext, isFlagged: boolean): DrawCommand[] {
  const { top, palette, highlight } = context;
  const colorOf = (note: StaffNote) => (isHighlighted(highlight, chord.event, note) ? palette.accent : palette.text);
  return [
    ...ledgerLines(chord, top, palette.line),
    ...accidentals(chord, palette.text),
    ...noteheads(chord, colorOf),
    ...dots(chord, top, palette.text, isFlagged && chord.direction === 'up'),
  ];
}

function engraveRests(events: readonly VoiceEvent[], chords: readonly (Chord | undefined)[], isMultiVoice: boolean, context: VoicesContext): DrawCommand[] {
  const { highlight, palette, top } = context;
  return events.flatMap((event, index) =>
    chords[index] === undefined ? rest(event, isMultiVoice, top, isHighlighted(highlight, event) ? palette.accent : palette.text) : [],
  );
}

/** Notes, rests, stems, beams, flags, tuplets, ties and ottava marks of a measure's voices. */
export function engraveVoices(events: readonly VoiceEvent[], context: VoicesContext): DrawCommand[] {
  const isMultiVoice = events.some((event) => event.voiceIndex > 0);
  const groups = beamGroups(events, context.header);
  const directions = stemDirections(events, groups, isMultiVoice);
  const chords = events.map((event, index) =>
    event.notes.length === 0 ? undefined : layoutChord(event, index, directions[index] ?? 'up', context.top),
  );
  const beamed = beamChords(groups, chords);
  const tips = stemTips(chords, beamed);
  const flagged = flaggedChords(chords, beamed);
  const ink = context.palette.text;
  const tupletPlacement = { events, chords, tips, isMultiVoice, top: context.top };
  return [
    ...chords.flatMap((chord) => (chord === undefined ? [] : engraveChord(chord, context, flagged.has(chord.eventIndex)))),
    ...stems(chords, tips, ink),
    ...beamed.flatMap((group) => beamPolygons(group, ink)),
    ...flags(chords, tips, flagged, ink),
    ...engraveRests(events, chords, isMultiVoice, context),
    ...tupletGroups(events).flatMap((members) => tupletNumber(members, tupletPlacement, ink)),
    ...ties({ events, chords, previousMeasure: context.previousMeasure, isMultiVoice, color: ink }),
    ...ottavaMarks(events, chords, context.top, ink),
  ];
}
