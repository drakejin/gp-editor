import type { Song, StringAddress, Track } from '@gp-editor/core';
import { type MeasureLayout, type RowLayout } from '../lib/layout';
import type { Palette } from '../theme';
import { type DrawCommand, translateCommands } from './draw';
import { type RowGeometry, type ScoreMode, showsNotation, showsTab } from './geometry';
import { engraveHeading } from './heading';
import { engraveNotationMeasure, engraveNotationRowHeader, notationRowHeaderWidth } from './notation';
import { engraveTabMeasure, engraveTabRowHeader, stringY } from './tab';

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

function engraveMeasure(context: RowContext, track: Track, placed: PlacedMeasure, isRowStart: boolean): DrawCommand[] {
  // The row header already shows the key at a row start; a key change there is not drawn twice.
  const layout = isRowStart ? { ...placed.layout, keySignatureX: undefined } : placed.layout;
  const header = context.song.measureHeaders[layout.measureIndex];
  const measure = track.measures[layout.measureIndex];
  if (header === undefined || measure === undefined) {
    return [];
  }
  const previousMeasure = track.measures[layout.measureIndex - 1];
  const cursor = context.cursor?.measureIndex === layout.measureIndex ? context.cursor : undefined;
  const playingBeatIndex = context.playing?.measureIndex === layout.measureIndex ? context.playing.beatIndex : undefined;
  const commands: DrawCommand[] = [...engraveHeading(header, layout, context.palette)];
  const { notationTop, tabTop, marksY } = context.geometry;
  if (notationTop !== undefined && showsNotation(context.mode)) {
    const highlight =
      playingBeatIndex !== undefined ? { beatIndex: playingBeatIndex } : cursor !== undefined ? { beatIndex: cursor.beatIndex, string: cursor.string } : undefined;
    commands.push(...engraveNotationMeasure({ track, header, measure, layout, previousMeasure, top: notationTop, palette: context.palette, highlight }));
  }
  if (tabTop !== undefined && marksY !== undefined && showsTab(context.mode)) {
    const previousBeat = previousMeasure?.beats[previousMeasure.beats.length - 1];
    const tabCursor = cursor === undefined ? undefined : { beatIndex: cursor.beatIndex, string: cursor.string };
    commands.push(
      ...engraveTabMeasure({ track, header, measure, layout, previousBeat, top: tabTop, marksY, showRhythm: context.mode === 'tab', palette: context.palette, cursor: tabCursor, playingBeatIndex }),
    );
  }
  return translateCommands(commands, placed.x, 0);
}
