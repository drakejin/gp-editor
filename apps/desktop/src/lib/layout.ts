import type { Beat, MeasureHeader, Song, Voice } from '@gp-editor/core';

/** Tab staff geometry, in points. */
export const TAB = {
  stringGap: 13,
  /** Space above the top string: measure number, marker, tempo, endings, then the effect marks row. */
  top: 54,
  /** Top of the effect marks row, clear of the fret numbers on the top string. */
  marksTop: 36,
  /** Space under the bottom string: rhythm stems. */
  bottom: 30,
  padLeft: 12,
  padRight: 8,
  timeSignatureWidth: 22,
  repeatWidth: 10,
  emptyMeasureWidth: 48,
  rowGap: 18,
} as const;

/** Natural width of a beat by its shortest note value. */
const BEAT_WIDTH: Readonly<Record<number, number>> = { 1: 64, 2: 48, 4: 36, 8: 30, 16: 26, 32: 24, 64: 22 };
const DOT_EXTRA = 6;
/** The last row is stretched to the full width only when it is at least this full. */
const JUSTIFY_THRESHOLD = 0.75;

export interface BeatLayout {
  readonly beatIndex: number;
  /** Centre of the beat, relative to the measure's left edge. */
  readonly x: number;
}

export interface MeasureLayout {
  readonly measureIndex: number;
  readonly width: number;
  readonly beats: readonly BeatLayout[];
  readonly showTimeSignature: boolean;
  readonly showTempo: boolean;
}

export interface RowLayout {
  readonly measures: readonly MeasureLayout[];
}

export function staffHeight(stringCount: number): number {
  return TAB.top + Math.max(0, stringCount - 1) * TAB.stringGap + TAB.bottom;
}

export function stringY(stringNumber: number): number {
  return TAB.top + (stringNumber - 1) * TAB.stringGap;
}

/** The voice used for rhythm display: the first voice that has a beat. */
export function primaryVoice(beat: Beat): Voice | undefined {
  return beat.voices.find((voice) => !voice.isEmpty);
}

function beatWidth(beat: Beat): number {
  const voices = beat.voices.filter((voice) => !voice.isEmpty);
  if (voices.length === 0) {
    return BEAT_WIDTH[4] ?? 36;
  }
  const shortest = Math.max(...voices.map((voice) => voice.duration.value));
  const dotted = voices.some((voice) => voice.duration.dotted || voice.duration.doubleDotted);
  return (BEAT_WIDTH[shortest] ?? 22) + (dotted ? DOT_EXTRA : 0);
}

function changed(headers: readonly MeasureHeader[], index: number, pick: (h: MeasureHeader) => string): boolean {
  const current = headers[index];
  const previous = headers[index - 1];
  return current !== undefined && (previous === undefined || pick(previous) !== pick(current));
}

export function layoutMeasure(song: Song, trackIndex: number, measureIndex: number): MeasureLayout {
  const header = song.measureHeaders[measureIndex];
  const beats = song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  const showTimeSignature = changed(song.measureHeaders, measureIndex, (h) => `${h.timeSignature.numerator}/${h.timeSignature.denominator}`);
  const showTempo = changed(song.measureHeaders, measureIndex, (h) => String(h.tempo));
  let x = TAB.padLeft + (showTimeSignature ? TAB.timeSignatureWidth : 0) + (header?.repeatOpen ? TAB.repeatWidth : 0);
  const beatLayouts = beats.map((beat, beatIndex) => {
    const width = beatWidth(beat);
    const layout = { beatIndex, x: x + width / 2 };
    x += width;
    return layout;
  });
  const closeWidth = header !== undefined && header.repeatClose > 0 ? TAB.repeatWidth : 0;
  const width = beats.length === 0 ? x + TAB.emptyMeasureWidth : x + TAB.padRight + closeWidth;
  return { measureIndex, width, beats: beatLayouts, showTimeSignature, showTempo };
}

/** Greedy line breaking. Every row but the last is stretched to `availableWidth`; the last one only when mostly full. */
export function layoutRows(measures: readonly MeasureLayout[], availableWidth: number): RowLayout[] {
  const rows: MeasureLayout[][] = [];
  let current: MeasureLayout[] = [];
  let currentWidth = 0;
  for (const measure of measures) {
    if (current.length > 0 && currentWidth + measure.width > availableWidth) {
      rows.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(measure);
    currentWidth += measure.width;
  }
  if (current.length > 0) {
    rows.push(current);
  }
  return rows.map((row, index) => ({ measures: justify(row, availableWidth, index === rows.length - 1) }));
}

function justify(row: readonly MeasureLayout[], availableWidth: number, isLastRow: boolean): readonly MeasureLayout[] {
  const natural = row.reduce((sum, measure) => sum + measure.width, 0);
  if (natural <= 0 || natural > availableWidth || (isLastRow && natural < availableWidth * JUSTIFY_THRESHOLD)) {
    return row;
  }
  const scale = availableWidth / natural;
  return row.map((measure) => ({
    ...measure,
    width: measure.width * scale,
    beats: measure.beats.map((beat) => ({ ...beat, x: beat.x * scale })),
  }));
}
