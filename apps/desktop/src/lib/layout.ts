import { type Beat, type BendPoint, type MeasureHeader, type Song, type Voice, stylesheetOf } from '@gp-editor/core';
import { directionsWidth } from '../score/directions';

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
  /** Per accidental of a key signature drawn where the key changes inside a row. */
  keyAccidentalWidth: 7,
  keySignaturePadding: 6,
  /** A clef drawn where the clef changes inside a row (cue size), with its padding. */
  clefChangeWidth: 22,
  repeatWidth: 10,
  emptyMeasureWidth: 48,
  rowGap: 18,
} as const;

/** Natural width of a beat by its shortest note value. */
const BEAT_WIDTH: Readonly<Record<number, number>> = { 1: 64, 2: 48, 4: 36, 8: 30, 16: 26, 32: 24, 64: 22 };
const DOT_EXTRA = 6;
/** Room a left-hand finger takes left of its notehead. */
const FINGERING_EXTRA = 8;
/** Room each rise or fall of a bend takes on the tab, so its arrows and amounts do not overlap. */
export const BEND_MOVE_WIDTH = 16;
/** Fret number and margins around a bend's arrows. */
const BEND_PADDING = 20;
/** The last row is stretched to the full width only when it is at least this full. */
const JUSTIFY_THRESHOLD = 0.75;
/** The closest beats are moved together to fit a line (squeezeRow, a fixed system), as a share of their natural distance. */
export const MIN_SQUEEZE = 0.25;

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
  /** The triplet feel differs from the previous bar's (on bar 1: it is not straight). */
  readonly showTripletFeel: boolean;
  /** Left edge of the clef when the track's clef changes at this measure (not at the first measure: the row header has it). */
  readonly clefChangeX?: number;
  /** Left edge of the key signature when the key changes at this measure (not at the first measure: the row header has it). */
  readonly keySignatureX?: number;
  /** Left edge of the time signature when it is shown. */
  readonly timeSignatureX?: number;
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
  const moves = Math.max(0, ...voices.flatMap((voice) => voice.notes.map((note) => (note.effect.bend === undefined ? 0 : bendMoves(note.effect.bend.points)))));
  const bendWidth = moves === 0 ? 0 : BEND_PADDING + moves * BEND_MOVE_WIDTH;
  const fingered = voices.some((voice) => voice.notes.some((note) => note.leftFinger !== undefined));
  return Math.max((BEAT_WIDTH[shortest] ?? 22) + (dotted ? DOT_EXTRA : 0) + (fingered ? FINGERING_EXTRA : 0), bendWidth);
}

/** How many times a bend rises or falls. */
function bendMoves(points: readonly BendPoint[]): number {
  const sorted = [...points].sort((a, b) => a.position - b.position);
  return sorted.filter((point, i) => i > 0 && point.value !== sorted[i - 1]?.value).length;
}

function changed(headers: readonly MeasureHeader[], index: number, pick: (h: MeasureHeader) => string): boolean {
  const current = headers[index];
  const previous = headers[index - 1];
  return current !== undefined && (previous === undefined || pick(previous) !== pick(current));
}

/** Room a beat needs beyond its notes (a chord diagram over it, `chordBeatWidth`); 0 for none. */
export type BeatRoom = (beat: Beat) => number;

export const NO_ROOM: BeatRoom = () => 0;

export function layoutMeasure(song: Song, trackIndex: number, measureIndex: number, beatRoom: BeatRoom = NO_ROOM): MeasureLayout {
  const frame = measureFrame(song, trackIndex, measureIndex);
  let x = frame.beatsX;
  const beatLayouts = beatWidths(song, trackIndex, measureIndex, beatRoom).map((width, beatIndex) => {
    const layout = { beatIndex, x: x + width / 2 };
    x += width;
    return layout;
  });
  return closeMeasure(song, measureIndex, frame, beatLayouts, beatLayouts.length === 0 ? undefined : x);
}

/** A measure's room before its first beat (padding, repeat sign, clef change, key change, time signature) and the marks it shows. */
export interface MeasureFrame extends Pick<MeasureLayout, 'showTimeSignature' | 'showTempo' | 'showTripletFeel' | 'clefChangeX' | 'keySignatureX' | 'timeSignatureX'> {
  /** Where the first beat's room starts. */
  readonly beatsX: number;
}

export function measureFrame(song: Song, trackIndex: number, measureIndex: number): MeasureFrame {
  const header = song.measureHeaders[measureIndex];
  const track = song.tracks[trackIndex];
  const showTimeSignature = changed(song.measureHeaders, measureIndex, (h) => `${h.timeSignature.numerator}/${h.timeSignature.denominator}`);
  const showTempo = changed(song.measureHeaders, measureIndex, (h) => String(h.tempo));
  const showTripletFeel = header !== undefined && header.tripletFeel !== (song.measureHeaders[measureIndex - 1]?.tripletFeel ?? 'none');
  const keyAccidentals = keyChangeAccidentals(track?.measures[measureIndex - 1]?.keySignature, track?.measures[measureIndex]?.keySignature);
  const previousClef = track?.measures[measureIndex - 1]?.clef;
  const hasClefChange = previousClef !== undefined && previousClef !== track?.measures[measureIndex]?.clef;
  let x = TAB.padLeft + (header?.repeatOpen ? TAB.repeatWidth : 0);
  const clefChangeX = hasClefChange ? x : undefined;
  x += hasClefChange ? TAB.clefChangeWidth : 0;
  const keySignatureX = keyAccidentals > 0 ? x : undefined;
  x += keyAccidentals > 0 ? keyAccidentals * TAB.keyAccidentalWidth + TAB.keySignaturePadding : 0;
  const timeSignatureX = showTimeSignature ? x : undefined;
  x += showTimeSignature ? TAB.timeSignatureWidth : 0;
  return { beatsX: x, showTimeSignature, showTempo, showTripletFeel, ...(clefChangeX === undefined ? {} : { clefChangeX }), keySignatureX, timeSignatureX };
}

/** The room each beat of the track's measure takes: its notes' (wider by the stylesheet's note spacing), or `beatRoom`'s when wider. */
export function beatWidths(song: Song, trackIndex: number, measureIndex: number, beatRoom: BeatRoom = NO_ROOM): number[] {
  const beats = song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
  const { noteSpacing } = stylesheetOf(song);
  return beats.map((beat) => Math.max(beatWidth(beat) * noteSpacing, beatRoom(beat)));
}

/** The measure's layout once its beats are placed; `beatsEnd` is where the last beat's room ends (undefined: no beats). */
export function closeMeasure(song: Song, measureIndex: number, frame: MeasureFrame, beats: readonly BeatLayout[], beatsEnd: number | undefined): MeasureLayout {
  const header = song.measureHeaders[measureIndex];
  const closeWidth = header !== undefined && header.repeatClose > 0 ? TAB.repeatWidth : 0;
  const natural = beatsEnd === undefined ? frame.beatsX + TAB.emptyMeasureWidth : beatsEnd + TAB.padRight + closeWidth;
  // A bar with directions is wide enough for its signs and words side by side.
  const width = Math.max(natural, directionsWidth(header));
  const { showTimeSignature, showTempo, showTripletFeel, clefChangeX, keySignatureX, timeSignatureX } = frame;
  return { measureIndex, width, beats, showTimeSignature, showTempo, showTripletFeel, ...(clefChangeX === undefined ? {} : { clefChangeX }), keySignatureX, timeSignatureX };
}

/** Accidentals drawn for a key change: the new key's, or naturals cancelling the old one when changing to C. */
function keyChangeAccidentals(previous: number | undefined, current: number | undefined): number {
  if (previous === undefined || current === undefined || previous === current) {
    return 0;
  }
  return current === 0 ? Math.abs(previous) : Math.abs(current);
}

/**
 * Greedy line breaking. Every row but the last is stretched to `availableWidth` (the first to `firstRowWidth`: the
 * multitrack view's first system has the tracks' full names); the last one only when mostly full.
 */
export function layoutRows(measures: readonly MeasureLayout[], availableWidth: number, firstRowWidth = availableWidth): RowLayout[] {
  const rows = breakRows(measures, availableWidth, firstRowWidth);
  return rows.map((row, index) => ({ measures: justify(row, index === 0 ? firstRowWidth : availableWidth, index === rows.length - 1) }));
}

/** The measures of each row, as greedy line breaking puts them (layoutRows, before stretching). */
export function breakRows(measures: readonly MeasureLayout[], availableWidth: number, firstRowWidth = availableWidth): MeasureLayout[][] {
  const rows: MeasureLayout[][] = [];
  let current: MeasureLayout[] = [];
  let currentWidth = 0;
  for (const measure of measures) {
    if (current.length > 0 && currentWidth + measure.width > (rows.length === 0 ? firstRowWidth : availableWidth)) {
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
  return rows;
}

/**
 * A row wider than `availableWidth` — a measure with more beats than a line holds — with its beats moved closer so it
 * fits; the room before each measure's first beat and after its last keeps its size. Beats come no closer than
 * MIN_SQUEEZE of their natural distance, so an extremely dense bar may still be wider. A row that fits is returned as is.
 * The PDF export uses it, where nothing may run past the page.
 */
export function squeezeRow(row: RowLayout, availableWidth: number): RowLayout {
  const natural = row.measures.reduce((sum, measure) => sum + measure.width, 0);
  const spread = row.measures.reduce((sum, measure) => sum + beatSpread(measure), 0);
  if (natural <= availableWidth || spread <= 0) {
    return row;
  }
  const scale = Math.max(MIN_SQUEEZE, 1 - (natural - availableWidth) / spread);
  return { measures: row.measures.map((measure) => squeezeMeasure(measure, scale)) };
}

/** From the first beat's centre to the last one's. */
function beatSpread(measure: MeasureLayout): number {
  const first = measure.beats[0];
  const last = measure.beats[measure.beats.length - 1];
  return first === undefined || last === undefined ? 0 : last.x - first.x;
}

function squeezeMeasure(measure: MeasureLayout, scale: number): MeasureLayout {
  return compressMeasure(measure, measure.beats[0]?.x ?? 0, beatSpread(measure), scale);
}

/**
 * The measure with its beats moved towards `anchor` to `scale` of their distance from it, narrower by what `spread`
 * (the beats' span it is squeezed for) loses; the room before its first beat and after its last keeps its size.
 */
export function compressMeasure(measure: MeasureLayout, anchor: number, spread: number, scale: number): MeasureLayout {
  return { ...measure, width: measure.width - spread * (1 - scale), beats: measure.beats.map((beat) => ({ ...beat, x: anchor + (beat.x - anchor) * scale })) };
}

function justify(row: readonly MeasureLayout[], availableWidth: number, isLastRow: boolean): readonly MeasureLayout[] {
  const scale = justifyScale(row, availableWidth, isLastRow);
  return scale === undefined ? row : row.map((measure) => stretchMeasure(measure, scale));
}

/** How much a row is stretched to fill `availableWidth`; undefined when it is left as it is. */
export function justifyScale(row: readonly MeasureLayout[], availableWidth: number, isLastRow: boolean): number | undefined {
  const natural = row.reduce((sum, measure) => sum + measure.width, 0);
  if (natural <= 0 || natural > availableWidth || (isLastRow && natural < availableWidth * JUSTIFY_THRESHOLD)) {
    return undefined;
  }
  return availableWidth / natural;
}

/** The measure stretched by `scale`; prefix glyphs keep their size, only the beat area stretches. */
export function stretchMeasure(measure: MeasureLayout, scale: number): MeasureLayout {
  return { ...measure, width: measure.width * scale, beats: measure.beats.map((beat) => ({ ...beat, x: beat.x * scale })) };
}
