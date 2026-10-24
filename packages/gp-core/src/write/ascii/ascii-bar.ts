// Port of TuxGuitar app.tuxguitar.io.ascii.ASCIITabOutputStream#drawMeasure / #getMaxOutLength / #getDurationScaping (LGPL-2.1).
import { measureTicks } from '../../model/defaults';
import { type Beat, type GuitarString, type Measure, type MeasureHeader, type Note, QUARTER_TIME } from '../../model/song';
import { noteText } from './ascii-output';

/** One bar as text: the chord names' segment and one segment per string, each `width` columns wide. */
export interface AsciiBar {
  readonly width: number;
  /** Two spaces (under the bar line and the first dash), then each beat's chord name padded to its column. */
  readonly chords: string;
  /** Per string, in the order given: "|-", then each beat's note text padded with dashes to its column. */
  readonly strings: readonly string[];
}

/** One beat's column: its texts and how many columns it takes. */
interface Column {
  readonly chord: string;
  readonly notes: readonly string[];
  readonly width: number;
}

/** getDurationScaping's limits: a beat lasting at most `limit` ticks takes `spacing` columns ([limit, spacing]). */
const SPACINGS: readonly (readonly [number, number])[] = [
  [QUARTER_TIME / 8, 1],
  [QUARTER_TIME / 4, 2],
  [QUARTER_TIME / 2, 3],
  [QUARTER_TIME, 4],
  [QUARTER_TIME * 2, 5],
];
/** Columns of a beat longer than a half note. */
const LONGEST_SPACING = 6;
/** The bar line and the dash after it. */
const BAR_OPENING = '|-';

/** getDurationScaping: 1 column for a 32nd or shorter, then one more per doubling, up to 6 past a half note. */
function durationSpacing(ticks: number): number {
  return SPACINGS.find(([limit]) => ticks <= limit)?.[1] ?? LONGEST_SPACING;
}

/** TGMeasureManager.getNote: the beat's note on the string, from the first non-empty voice that has one. */
function noteOn(beat: Beat | undefined, stringNumber: number): Note | undefined {
  for (const voice of beat?.voices ?? []) {
    const note = voice.isEmpty ? undefined : voice.notes.find((candidate) => candidate.string === stringNumber);
    if (note !== undefined) {
      return note;
    }
  }
  return undefined;
}

/** A beat lasts to the next beat, the bar's last one to the bar's end; its column is wider than its longest text. */
function beatColumn(beat: Beat, next: Beat | undefined, barEnd: number, strings: readonly GuitarString[]): Column {
  const notes = strings.map((string) => noteText(noteOn(beat, string.number), noteOn(next, string.number)));
  const chord = beat.chord?.name ?? '';
  const longest = Math.max(chord.length, ...notes.map((text) => text.length));
  const spacing = durationSpacing((next?.start ?? barEnd) - beat.start);
  return { chord, notes, width: spacing <= longest ? longest + 1 : spacing };
}

/**
 * A bar of the track: one column per beat (by start). A bar without beats (TuxGuitar draws only "|-") is as wide as a
 * rest filling it.
 */
export function buildAsciiBar(measure: Measure, header: MeasureHeader, strings: readonly GuitarString[]): AsciiBar {
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const beats = [...measure.beats].sort((a, b) => a.start - b.start);
  const columns: readonly Column[] =
    beats.length === 0
      ? [{ chord: '', notes: strings.map(() => ''), width: durationSpacing(length) }]
      : beats.map((beat, index) => beatColumn(beat, beats[index + 1], header.start + length, strings));
  return {
    width: BAR_OPENING.length + columns.reduce((total, column) => total + column.width, 0),
    chords: ' '.repeat(BAR_OPENING.length) + columns.map((column) => column.chord.padEnd(column.width)).join(''),
    strings: strings.map((_, index) => BAR_OPENING + columns.map((column) => (column.notes[index] ?? '').padEnd(column.width, '-')).join('')),
  };
}
