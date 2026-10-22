import type { Measure, Rgb, Song } from '@gp-editor/core';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { rgbHex } from './heading';

/**
 * Geometry of the tracks panel's bar map (Guitar Pro's navigator), in points: a header of bar numbers, one row of
 * cells per track (a cell per bar), and a row of section markers at the bottom.
 */
export const BAR_MAP = {
  cellWidth: 14,
  cellHeight: 14,
  /** Between two cells of a row. */
  gap: 1,
  rowHeight: 22,
  headerHeight: 20,
  sectionsHeight: 20,
  padLeft: 6,
  padRight: 16,
  /** Bar 1 and every `numberEvery`th bar are numbered. */
  numberEvery: 4,
  numberSize: 9,
  /** The dark square marking the cursor's bar on the selected track. */
  cursorSize: 8,
  sectionBox: 14,
  sectionTitleSize: 10,
  /** Rough width of one section-title character at `sectionTitleSize`, to cut a title before the next section. */
  titleCharWidth: 5.6,
  titleGap: 4,
  titleEndGap: 6,
  /** Room kept between a bar scrolled into view and the edge of the view. */
  scrollMargin: 45,
  /** A track colour darker than this (its brightest channel, 0–1) is scaled up to it on the dark chrome. */
  minCellBrightness: 0.6,
} as const;

const CHANNEL_MAX = 255;

/** Alpha (hex) of the selected track's row tint and of the playing bar's column tint. */
const SELECTED_ROW_ALPHA = '33';
const PLAYING_COLUMN_ALPHA = '4D';
const LETTER_COUNT = 26;
const FIRST_LETTER = 65;

export interface BarMapInput {
  readonly song: Song;
  readonly selectedTrackIndex: number;
  readonly cursorMeasureIndex?: number;
  readonly playingMeasureIndex?: number;
  readonly palette: Palette;
}

/** What a click on the bar map points at: a track's bar (a cell), or only a bar (bar numbers, sections). */
export type BarMapHit = { readonly trackIndex: number; readonly measureIndex: number } | { readonly measureIndex: number };

/** True when any non-empty voice of any beat holds a note (a bar of rests is false). */
export function measureHasNotes(measure: Measure): boolean {
  return measure.beats.some((beat) => beat.voices.some((voice) => !voice.isEmpty && voice.notes.length > 0));
}

/**
 * The track's colour as the panel draws it (filled bars, instrument icon): a very dark colour is scaled up, hue kept,
 * so its bars stand apart from empty ones on the dark chrome; black becomes grey.
 */
export function visibleTrackColor(color: Rgb): string {
  const brightest = Math.max(color.r, color.g, color.b);
  const floor = BAR_MAP.minCellBrightness * CHANNEL_MAX;
  if (brightest >= floor) {
    return rgbHex(color);
  }
  if (brightest <= 0) {
    return rgbHex({ r: floor, g: floor, b: floor });
  }
  const scale = floor / brightest;
  return rgbHex({ r: Math.round(color.r * scale), g: Math.round(color.g * scale), b: Math.round(color.b * scale) });
}

const PITCH = BAR_MAP.cellWidth + BAR_MAP.gap;

/** Left edge of a bar's cells. */
export function barMapCellX(measureIndex: number): number {
  return BAR_MAP.padLeft + measureIndex * PITCH;
}

export function barMapWidth(song: Song): number {
  const count = song.measureHeaders.length;
  return BAR_MAP.padLeft + (count > 0 ? count * PITCH - BAR_MAP.gap : 0) + BAR_MAP.padRight;
}

export function barMapHeight(song: Song): number {
  return sectionsTop(song) + BAR_MAP.sectionsHeight;
}

function rowTop(trackIndex: number): number {
  return BAR_MAP.headerHeight + trackIndex * BAR_MAP.rowHeight;
}

function sectionsTop(song: Song): number {
  return rowTop(song.tracks.length);
}

/** Bar numbers, a row of cells per track, the cursor and playing bar, and the sections. */
export function engraveBarMap(input: BarMapInput): DrawCommand[] {
  const { song, palette } = input;
  const width = barMapWidth(song);
  return [
    { kind: 'rect', x: 0, y: 0, width, height: BAR_MAP.headerHeight, color: palette.chromeDeep },
    { kind: 'rect', x: 0, y: sectionsTop(song), width, height: BAR_MAP.sectionsHeight, color: palette.chromeDeep },
    ...selectedRow(input, width),
    ...playingColumn(input),
    ...barNumbers(song, palette),
    ...song.tracks.flatMap((track, trackIndex) => trackCells(track.measures, visibleTrackColor(track.color), trackIndex, palette)),
    ...rowLines(song, width, palette),
    ...cursorMarker(input),
    ...sections(song, palette),
  ];
}

/** Tint of the selected track's row, on the bar map and in the track table beside it. */
export function selectedRowColor(palette: Palette): string {
  return `${palette.chromeAccent}${SELECTED_ROW_ALPHA}`;
}

function selectedRow({ song, selectedTrackIndex, palette }: BarMapInput, width: number): DrawCommand[] {
  if (song.tracks[selectedTrackIndex] === undefined) {
    return [];
  }
  return [{ kind: 'rect', x: 0, y: rowTop(selectedTrackIndex), width, height: BAR_MAP.rowHeight, color: selectedRowColor(palette) }];
}

/** A tinted column from the bar number down through every track, edged in the accent colour. */
function playingColumn({ song, playingMeasureIndex, palette }: BarMapInput): DrawCommand[] {
  if (playingMeasureIndex === undefined || song.measureHeaders[playingMeasureIndex] === undefined) {
    return [];
  }
  const left = barMapCellX(playingMeasureIndex) - 1;
  const right = barMapCellX(playingMeasureIndex) + BAR_MAP.cellWidth + 1;
  const bottom = sectionsTop(song);
  return [
    { kind: 'rect', x: left, y: 0, width: right - left, height: bottom, color: `${palette.chromeAccent}${PLAYING_COLUMN_ALPHA}` },
    { kind: 'line', x1: left + 0.5, y1: 0, x2: left + 0.5, y2: bottom, width: 1, color: palette.chromeAccent },
    { kind: 'line', x1: right - 0.5, y1: 0, x2: right - 0.5, y2: bottom, width: 1, color: palette.chromeAccent },
  ];
}

/** Bar 1 and every 4th bar: a tick at the bar's left edge and its number beside it. */
function barNumbers(song: Song, palette: Palette): DrawCommand[] {
  const bottom = BAR_MAP.headerHeight;
  return song.measureHeaders.flatMap((header, measureIndex): DrawCommand[] => {
    if (header.number !== 1 && header.number % BAR_MAP.numberEvery !== 0) {
      return [];
    }
    const x = barMapCellX(measureIndex);
    return [
      { kind: 'line', x1: x + 0.5, y1: bottom - 6, x2: x + 0.5, y2: bottom, width: 1, color: palette.chromeMuted },
      { kind: 'text', x: x + 2, y: bottom / 2 - 1, text: String(header.number), size: BAR_MAP.numberSize, color: palette.chromeMuted, font: 'ui', align: 'left' },
    ];
  });
}

function trackCells(measures: readonly Measure[], color: string, trackIndex: number, palette: Palette): DrawCommand[] {
  const y = rowTop(trackIndex) + (BAR_MAP.rowHeight - BAR_MAP.cellHeight) / 2;
  return measures.map((measure, measureIndex) => ({
    kind: 'rect',
    x: barMapCellX(measureIndex),
    y,
    width: BAR_MAP.cellWidth,
    height: BAR_MAP.cellHeight,
    color: measureHasNotes(measure) ? color : palette.chromeRaised,
    radius: 1.5,
  }));
}

/** A dark line under each track's row, as under each row of the track table beside the map. */
function rowLines(song: Song, width: number, palette: Palette): DrawCommand[] {
  return song.tracks.map((_, trackIndex) => {
    const y = rowTop(trackIndex + 1) - 0.5;
    return { kind: 'line', x1: 0, y1: y, x2: width, y2: y, width: 1, color: palette.chromeBorder };
  });
}

function cursorMarker({ song, selectedTrackIndex, cursorMeasureIndex, palette }: BarMapInput): DrawCommand[] {
  if (cursorMeasureIndex === undefined || song.tracks[selectedTrackIndex]?.measures[cursorMeasureIndex] === undefined) {
    return [];
  }
  const size = BAR_MAP.cursorSize;
  const x = barMapCellX(cursorMeasureIndex) + (BAR_MAP.cellWidth - size) / 2;
  const y = rowTop(selectedTrackIndex) + (BAR_MAP.rowHeight - size) / 2;
  return [{ kind: 'rect', x, y, width: size, height: size, color: palette.chromeBorder, radius: 1 }];
}

interface Section {
  readonly measureIndex: number;
  readonly title: string;
}

function songSections(song: Song): Section[] {
  return song.measureHeaders.flatMap((header, measureIndex) => (header.marker === undefined ? [] : [{ measureIndex, title: header.marker.title }]));
}

/** A, B, … Z, then A2, B2 … */
export function sectionLetter(sectionIndex: number): string {
  const round = Math.floor(sectionIndex / LETTER_COUNT);
  return `${String.fromCharCode(FIRST_LETTER + (sectionIndex % LETTER_COUNT))}${round > 0 ? round + 1 : ''}`;
}

/** Each section's letter in a box at its first bar and its title beside it, cut before the next section. */
function sections(song: Song, palette: Palette): DrawCommand[] {
  const list = songSections(song);
  const top = sectionsTop(song);
  const middle = top + BAR_MAP.sectionsHeight / 2;
  const box = BAR_MAP.sectionBox;
  return list.flatMap((section, i): DrawCommand[] => {
    const x = barMapCellX(section.measureIndex);
    const next = list[i + 1];
    const titleX = x + box + BAR_MAP.titleGap;
    const end = next === undefined ? barMapWidth(song) - 2 : barMapCellX(next.measureIndex) - BAR_MAP.titleEndGap;
    const title = fitTitle(section.title, Math.floor((end - titleX) / BAR_MAP.titleCharWidth));
    const commands: DrawCommand[] = [
      { kind: 'rect', x, y: middle - box / 2, width: box, height: box, color: palette.chromeText, radius: 2 },
      { kind: 'text', x: x + box / 2, y: middle, text: sectionLetter(i), size: BAR_MAP.numberSize, color: palette.chromeDeep, font: 'ui', align: 'center', bold: true },
    ];
    return title === undefined
      ? commands
      : [...commands, { kind: 'text', x: titleX, y: middle, text: title, size: BAR_MAP.sectionTitleSize, color: palette.chromeText, font: 'ui', align: 'left' }];
  });
}

/** The title, cut with "…" to `maxChars`; undefined when not even two characters fit (or it is empty). */
function fitTitle(title: string, maxChars: number): string | undefined {
  const trimmed = title.trim();
  if (trimmed.length === 0 || maxChars < 1) {
    return undefined;
  }
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return maxChars < 2 ? undefined : `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * The track and bar under a point. Bar numbers give only the bar; the sections row gives the first bar of the section
 * under the point (the bar itself before the first section). Undefined outside the bars.
 */
export function hitTestBarMap(song: Song, x: number, y: number): BarMapHit | undefined {
  const measureIndex = Math.floor((x - BAR_MAP.padLeft) / PITCH);
  if (x < BAR_MAP.padLeft || measureIndex >= song.measureHeaders.length || y < 0) {
    return undefined;
  }
  if (y < BAR_MAP.headerHeight) {
    return { measureIndex };
  }
  if (y < sectionsTop(song)) {
    return { trackIndex: Math.floor((y - BAR_MAP.headerHeight) / BAR_MAP.rowHeight), measureIndex };
  }
  if (y < barMapHeight(song)) {
    const section = songSections(song).filter((candidate) => candidate.measureIndex <= measureIndex).pop();
    return { measureIndex: section?.measureIndex ?? measureIndex };
  }
  return undefined;
}

/**
 * Horizontal scroll offset that brings a bar into a view `viewportWidth` wide scrolled to `scrollX`, keeping
 * `BAR_MAP.scrollMargin` around it; undefined when it is already in view (or the view has no width yet).
 */
export function scrollOffsetToShowBar(measureIndex: number, scrollX: number, viewportWidth: number): number | undefined {
  if (viewportWidth <= 0) {
    return undefined;
  }
  const left = barMapCellX(measureIndex) - BAR_MAP.scrollMargin;
  const right = barMapCellX(measureIndex) + BAR_MAP.cellWidth + BAR_MAP.scrollMargin;
  if (left < scrollX) {
    return Math.max(0, left);
  }
  if (right > scrollX + viewportWidth) {
    return right - viewportWidth;
  }
  return undefined;
}
