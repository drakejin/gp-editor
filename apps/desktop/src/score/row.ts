import { type Measure, type MeasureHeader, type Song, type StringAddress, type Track, isMeasureOverfull } from '@gp-editor/core';
import { type MeasureLayout, type RowLayout } from '../lib/layout';
import type { Palette } from '../theme';
import { type DrawCommand, translateCommands } from './draw';
import { engraveDirections } from './directions';
import { engraveDynamics } from './dynamics';
import { engraveHairpins } from './hairpins';
import { engraveNotationExpressions } from './notation-expressions';
import { engravePedals } from './pedals';
import { engraveChords } from './chords';
import { type RowGeometry, type ScoreMode, showsNotation, showsTab } from './geometry';
import { engraveHeading } from './heading';
import { engraveLyrics } from './lyrics';
import { engraveNotationMeasure, engraveNotationRowHeader, notationRowHeaderWidth } from './notation';
import { type BeatRange, engraveSelection } from './selection-tint';
import { type TabMarkKind, engraveTabMeasure, engraveTabRowHeader, stringY } from './tab';

/** Width of the clef column of tab-only rows. */
const TAB_HEADER_WIDTH = 30;
const NOTATION_LINES = 5;
const STAFF_SPACE = 8;

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
  return [...rowHeader(context, track, placed), ...placed.flatMap((measure, i) => engraveMeasure(context, track, measure, i === 0))];
}

function rowHeader(context: RowContext, track: Track, placed: readonly PlacedMeasure[]): DrawCommand[] {
  const { geometry, palette, headerWidth } = context;
  const first = track.measures[placed[0]?.layout.measureIndex ?? 0];
  const commands: DrawCommand[] = [];
  if (geometry.notationTop !== undefined && first !== undefined) {
    commands.push(...staffLines(0, headerWidth, geometry.notationTop, NOTATION_LINES, STAFF_SPACE, palette.line));
    commands.push(...engraveNotationRowHeader(track, first, geometry.notationTop, palette));
  }
  if (geometry.tabTop !== undefined) {
    commands.push(...staffLines(0, headerWidth, geometry.tabTop, track.strings.length, stringY(0, 2), palette.line));
    commands.push(...engraveTabRowHeader(track, geometry.tabTop, palette));
  }
  const top = geometry.notationTop ?? geometry.tabTop ?? 0;
  const bottom = geometry.tabTop !== undefined ? stringY(geometry.tabTop, track.strings.length) : top + (NOTATION_LINES - 1) * STAFF_SPACE;
  commands.push({ kind: 'line', x1: 0.5, y1: top, x2: 0.5, y2: bottom, width: 1, color: palette.text });
  return commands;
}

function staffLines(x1: number, x2: number, top: number, count: number, gap: number, color: string): DrawCommand[] {
  return Array.from({ length: count }, (_, i): DrawCommand => ({ kind: 'line', x1, y1: top + i * gap, x2, y2: top + i * gap, width: 1, color }));
}

/** One measure of the row with the measures either side of it, and the cursor or playing beat when they are in it. */
interface MeasureScope {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  readonly cursor?: StringAddress;
  readonly playingBeatIndex?: number;
}

function engraveMeasure(context: RowContext, track: Track, placed: PlacedMeasure, isRowStart: boolean): DrawCommand[] {
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
    cursor: context.cursor?.measureIndex === layout.measureIndex ? context.cursor : undefined,
    playingBeatIndex: context.playing?.measureIndex === layout.measureIndex ? context.playing.beatIndex : undefined,
  };
  const notation = engraveNotation(context, scope);
  const { chordNamesY, chordDiagramsTop } = context.geometry;
  const commands = [
    ...engraveHeading(header, layout, context.palette, isMeasureOverfull(measure, header)),
    ...engraveChords({ measure, layout, namesY: chordNamesY, diagramsTop: chordDiagramsTop, palette: context.palette }),
    ...(notation ?? []),
    ...engraveMeasureDynamics(context, scope, notation),
    ...engraveMeasureMarks(context, scope),
    ...(context.geometry.lyricsY === undefined ? [] : engraveLyrics({ track, layout, y: context.geometry.lyricsY, palette: context.palette })),
    ...engraveTab(context, scope),
    ...engraveSelection(context.selection, layout, context.geometry, track.strings.length, context.palette),
  ];
  return translateCommands(commands, placed.x, 0);
}

function engraveNotation(context: RowContext, scope: MeasureScope): DrawCommand[] | undefined {
  const { notationTop } = context.geometry;
  if (notationTop === undefined || !showsNotation(context.mode)) {
    return undefined;
  }
  const { cursor, playingBeatIndex } = scope;
  const highlight =
    playingBeatIndex !== undefined ? { beatIndex: playingBeatIndex } : cursor !== undefined ? { beatIndex: cursor.beatIndex, string: cursor.string } : undefined;
  const { track, header, measure, layout, previousMeasure, nextMeasure } = scope;
  // Pick strokes go over the tab when it is shown, else over the notation.
  const showsPickStrokes = !showsTab(context.mode);
  return engraveNotationMeasure({ track, header, measure, layout, previousMeasure, nextMeasure, top: notationTop, palette: context.palette, highlight, showsPickStrokes });
}

/** Dynamics under the notation staff, clear of its notes, when it is shown; else in their band under the tab. */
function engraveMeasureDynamics(context: RowContext, scope: MeasureScope, notation: readonly DrawCommand[] | undefined): DrawCommand[] {
  const { dynamicsY, notationTop } = context.geometry;
  if (dynamicsY === undefined) {
    return [];
  }
  const staff = notation === undefined || notationTop === undefined ? undefined : { commands: notation, bottomLine: notationTop + (NOTATION_LINES - 1) * STAFF_SPACE };
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
  const expressions = notationTop !== undefined && tabTop === undefined ? engraveNotationExpressions(measure, layout, notationTop, palette) : [];
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
  const { track, header, measure, layout, previousMeasure, nextMeasure, cursor, playingBeatIndex } = scope;
  const previousBeat = previousMeasure?.beats[previousMeasure.beats.length - 1];
  const tabCursor = cursor === undefined ? undefined : { beatIndex: cursor.beatIndex, string: cursor.string };
  return engraveTabMeasure({
    track, header, measure, layout, previousBeat, previousMeasure, nextMeasure, markLanes: context.markLanes,
    top: tabTop, marksY, showRhythm: context.mode === 'tab', palette: context.palette, cursor: tabCursor, playingBeatIndex,
  });
}
