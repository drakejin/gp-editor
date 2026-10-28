import { type Measure, type MeasureHeader, type Song, type StringAddress, type Stylesheet, type Track, isMeasureOverfull, stylesheetOf } from '@gp-editor/core';
import { isKeyboardTrack } from '../lib/fingering';
import { type MeasureLayout, type RowLayout, TAB } from '../lib/layout';
import type { Palette } from '../theme';
import { type DrawCommand, translateCommands } from './draw';
import { engraveDirections } from './directions';
import { engraveDynamics } from './dynamics';
import { engraveHairpins } from './hairpins';
import { engraveNotationExpressions } from './notation-expressions';
import { engravePedals } from './pedals';
import { engraveChords } from './chords';
import { engraveFreeTexts } from './free-text';
import { type RowGeometry, type ScoreMode, showsNotation, showsTab, stavesSpan } from './geometry';
import { type HeadingStyle, engraveHeading } from './heading';
import { engraveLyrics } from './lyrics';
import { STAFF_HEIGHT, engraveNotationMeasure, engraveNotationRowHeader, notationRowHeaderWidth, staffLines } from './notation';
import { trackTransposition } from './notation/pitch';
import { type BeatRange, engraveSelection } from './selection-tint';
import type { NextInRow } from './symbols/links';
import { type TabMarkKind, engraveTabMeasure, engraveTabRowHeader } from './tab';

/** Width of the clef column of tab-only rows. */
const TAB_HEADER_WIDTH = 30;

/** A measure with its x offset in the row. */
export interface PlacedMeasure {
  readonly layout: MeasureLayout;
  readonly x: number;
}

/** A beat currently highlighted as playing. */
export interface PlayingBeat {
  readonly measureIndex: number;
  readonly beatIndex: number;
}

export interface RowContext {
  readonly song: Song;
  readonly trackIndex: number;
  readonly row: RowLayout;
  readonly headerWidth: number;
  readonly mode: ScoreMode;
  readonly geometry: RowGeometry;
  readonly palette: Palette;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  /** Selected beats (tinted). */
  readonly selection?: BeatRange;
  /** Effect-mark lanes of the track (`tabMarkLanes`), so every row stacks marks the same way. */
  readonly markLanes?: readonly TabMarkKind[];
  /** The voice being edited in the track (the cursor's, in every row): the other voices faded (Guitar Pro 8). */
  readonly editedVoiceIndex?: number;
  /** Bar numbers, markers, tempo and endings over the staves; only the top staff of a multitrack system has them. */
  readonly hasHeading?: boolean;
}

/** Clef (+ key signature) column at the start of every row, wide enough for the track's largest key signature. */
export function rowHeaderWidth(mode: ScoreMode, track: Track): number {
  if (!showsNotation(mode)) {
    return TAB_HEADER_WIDTH;
  }
  const widestKey = Math.max(0, ...track.measures.map((measure) => Math.abs(measure.keySignature)));
  return Math.max(TAB_HEADER_WIDTH, notationRowHeaderWidth(track, widestKey));
}

export function placeRow(row: RowLayout, headerWidth: number): PlacedMeasure[] {
  let x = headerWidth;
  return row.measures.map((layout) => {
    const placed = { layout, x };
    x += layout.width;
    return placed;
  });
}

/** Everything drawn for one row of the score. */
export function engraveRow(context: RowContext): DrawCommand[] {
  const track = context.song.tracks[context.trackIndex];
  if (track === undefined) {
    return [];
  }
  const placed = placeRow(context.row, context.headerWidth);
  return [...rowHeader(context, track, placed), ...placed.flatMap((measure, i) => engraveMeasure(context, track, measure, i === 0, placed[i + 1]?.layout))];
}

function rowHeader(context: RowContext, track: Track, placed: readonly PlacedMeasure[]): DrawCommand[] {
  const { geometry, palette, headerWidth } = context;
  const first = track.measures[placed[0]?.layout.measureIndex ?? 0];
  const commands: DrawCommand[] = [];
  if (geometry.notationTop !== undefined && first !== undefined) {
    commands.push(...staffLines(0, headerWidth, geometry.notationTop, palette.line));
    commands.push(...engraveNotationRowHeader(track, first, geometry.notationTop, palette));
  }
  if (geometry.tabTop !== undefined) {
    commands.push(...stringLines(headerWidth, geometry.tabTop, track.strings.length, palette.line));
    commands.push(...engraveTabRowHeader(track, geometry.tabTop, palette));
  }
  // Every row shows a staff (rowGeometry): the line at the row's start runs from its top to its bottom.
  const { top, bottom } = stavesSpan(geometry, track.strings.length) ?? { top: 0, bottom: STAFF_HEIGHT };
  commands.push({ kind: 'line', x1: 0.5, y1: top, x2: 0.5, y2: bottom, width: 1, color: palette.text });
  return commands;
}

/** The tab staff's string lines across the row's header. */
function stringLines(width: number, top: number, count: number, color: string): DrawCommand[] {
  return Array.from({ length: count }, (_, i): DrawCommand => ({ kind: 'line', x1: 0, y1: top + i * TAB.stringGap, x2: width, y2: top + i * TAB.stringGap, width: 1, color }));
}

/** One measure of the row with the measures either side of it, and the cursor or playing beat when they are in it. */
interface MeasureScope {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  /** The next measure when it is on this row too: links into it are drawn whole from here. */
  readonly nextInRow?: NextInRow;
  readonly cursor?: StringAddress;
  readonly playingBeatIndex?: number;
  readonly isRowStart: boolean;
  /** The song's stylesheet (stylesheetOf): fonts, labels and the notation options the engravers honour. */
  readonly sheet: Stylesheet;
}

function engraveMeasure(context: RowContext, track: Track, placed: PlacedMeasure, isRowStart: boolean, nextLayout?: MeasureLayout): DrawCommand[] {
  // The row header already shows the key at a row start; a key change there is not drawn twice.
  const layout = isRowStart ? { ...placed.layout, keySignatureX: undefined } : placed.layout;
  const header = context.song.measureHeaders[layout.measureIndex];
  const measure = track.measures[layout.measureIndex];
  if (header === undefined || measure === undefined) {
    return [];
  }
  const scope: MeasureScope = {
    track, header, measure, layout,
    previousMeasure: track.measures[layout.measureIndex - 1],
    nextMeasure: track.measures[layout.measureIndex + 1],
    nextInRow: followingInRow(context.song, layout.measureIndex, nextLayout),
    cursor: context.cursor?.measureIndex === layout.measureIndex ? context.cursor : undefined,
    playingBeatIndex: context.playing?.measureIndex === layout.measureIndex ? context.playing.beatIndex : undefined,
    isRowStart,
    sheet: stylesheetOf(context.song),
  };
  const notation = engraveNotation(context, scope);
  const { chordNamesY, chordDiagramsTop, freeTextY, lyricsY } = context.geometry;
  const { palette } = context;
  const { texts } = scope.sheet;
  const commands = [
    ...(context.hasHeading === false ? [] : engraveHeading(header, layout, palette, isMeasureOverfull(measure, header), headingStyle(scope))),
    ...(freeTextY === undefined ? [] : engraveFreeTexts({ measure, layout, y: freeTextY, palette, style: texts.freeText })),
    ...engraveChords({ measure, layout, namesY: chordNamesY, diagramsTop: chordDiagramsTop, palette, style: texts.chordName }),
    ...(notation ?? []),
    ...engraveMeasureDynamics(context, scope, notation),
    ...engraveMeasureMarks(context, scope),
    ...(lyricsY === undefined ? [] : engraveLyrics({ track, layout, y: lyricsY, palette, style: texts.lyrics })),
    ...engraveTab(context, scope),
    ...engraveSelection(context.selection, layout, context.geometry, track.strings.length, context.palette),
  ];
  return translateCommands(commands, placed.x, 0);
}

/** The measure after this one on the row (none at the row's end), for the links drawn whole across the bar line. */
function followingInRow(song: Song, measureIndex: number, layout: MeasureLayout | undefined): NextInRow | undefined {
  const header = layout?.measureIndex === measureIndex + 1 ? song.measureHeaders[layout.measureIndex] : undefined;
  return layout === undefined || header === undefined ? undefined : { header, layout };
}

/** The stylesheet's bar numbers and tempo for the heading of the scope's bar. */
function headingStyle({ sheet, isRowStart }: MeasureScope): HeadingStyle {
  return { barNumbers: sheet.barNumbers, isRowStart, barNumber: sheet.texts.barNumber, tempo: sheet.texts.tempo, showsTempoDecimals: sheet.notation.showsTempoDecimals };
}

function engraveNotation(context: RowContext, scope: MeasureScope): DrawCommand[] | undefined {
  const { notationTop } = context.geometry;
  if (notationTop === undefined || !showsNotation(context.mode)) {
    return undefined;
  }
  const { cursor, playingBeatIndex } = scope;
  const highlight =
    playingBeatIndex !== undefined
      ? { beatIndex: playingBeatIndex }
      : cursor !== undefined
      ? { beatIndex: cursor.beatIndex, string: cursor.string, voiceIndex: cursor.voiceIndex }
      : undefined;
  const { track, header, measure, layout, previousMeasure, nextMeasure, nextInRow, isRowStart } = scope;
  // Pick strokes go over the tab when it is shown, else over the notation.
  const showsPickStrokes = !showsTab(context.mode);
  const isKeyboard = isKeyboardTrack(context.song, context.trackIndex);
  const transposition = trackTransposition(context.song, context.trackIndex);
  const { editedVoiceIndex } = context;
  const { showsCommonTime } = scope.sheet.notation;
  return engraveNotationMeasure({ track, header, measure, layout, previousMeasure, nextMeasure, nextInRow, isRowStart, top: notationTop, palette: context.palette, highlight, showsPickStrokes, isKeyboard, transposition, editedVoiceIndex, showsCommonTime });
}

/** Dynamics under the notation staff, clear of its notes, when it is shown; else in their band under the tab. */
function engraveMeasureDynamics(context: RowContext, scope: MeasureScope, notation: readonly DrawCommand[] | undefined): DrawCommand[] {
  const { dynamicsY, notationTop } = context.geometry;
  if (dynamicsY === undefined) {
    return [];
  }
  const staff = notation === undefined || notationTop === undefined ? undefined : { commands: notation, bottomLine: notationTop + STAFF_HEIGHT };
  const { layout } = scope;
  return engraveDynamics({ measures: scope.track.measures, measureIndex: layout.measureIndex, layout, y: dynamicsY, palette: context.palette, staff });
}

/**
 * The bar's directions under the heading, the hairpins and the sustain pedal under the staves, in their bands (and the
 * fades and rasgueados over a notation staff without tab).
 */
function engraveMeasureMarks(context: RowContext, scope: MeasureScope): DrawCommand[] {
  const { directionsY, dynamicsY, pedalsY, notationTop, tabTop } = context.geometry;
  const { track, header, measure, layout } = scope;
  const { measureIndex } = layout;
  const { palette } = context;
  // Without a tab staff, the fades and rasgueados go over the notation.
  const expressions = notationTop !== undefined && tabTop === undefined ? engraveNotationExpressions(measure, layout, notationTop, palette, scope.sheet.notation) : [];
  return [
    ...expressions,
    ...(directionsY === undefined ? [] : engraveDirections(header, layout.width, directionsY, palette)),
    ...(dynamicsY === undefined ? [] : engraveHairpins({ measures: track.measures, measureIndex, layout, y: dynamicsY, palette })),
    ...(pedalsY === undefined ? [] : engravePedals({ measures: track.measures, measureIndex, header, layout, y: pedalsY, palette })),
  ];
}

function engraveTab(context: RowContext, scope: MeasureScope): DrawCommand[] {
  const { tabTop, marksY } = context.geometry;
  if (tabTop === undefined || marksY === undefined || !showsTab(context.mode)) {
    return [];
  }
  const { track, header, measure, layout, previousMeasure, nextMeasure, nextInRow, isRowStart, cursor, playingBeatIndex } = scope;
  const previousBeat = previousMeasure?.beats[previousMeasure.beats.length - 1];
  const tabCursor = cursor === undefined ? undefined : { beatIndex: cursor.beatIndex, string: cursor.string, voiceIndex: cursor.voiceIndex };
  return engraveTabMeasure({
    track, header, measure, layout, previousBeat, previousMeasure, nextMeasure, nextInRow, isRowStart, markLanes: context.markLanes,
    top: tabTop, marksY, showRhythm: context.mode === 'tab', palette: context.palette, cursor: tabCursor, playingBeatIndex,
    editedVoiceIndex: context.editedVoiceIndex, notation: scope.sheet.notation,
  });
}
