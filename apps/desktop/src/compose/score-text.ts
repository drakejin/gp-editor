// i18n-exempt-file: the score written as text for Claude's prompt, never shown
import { type MeasureHeader, type Song, repeatPlays } from '@gp-editor/core';
import { endingNumbers } from '../score/heading';
import {
  NOTATION_LEGEND,
  type TrackNotation,
  trackBarText,
  trackNotationOf,
} from './score-notation';
import { type ScoreStats, isCoarsestGrid, scoreStats, summaryGrid, summaryLine } from './score-summary';
import { ALL_REST, type BarSource, DetailLength, SummaryLengths, type TrackLine } from './score-window';

/**
 * Characters of score text a request carries at most. Measured on the fixtures: this notation runs ~1.3 characters a
 * token by Anthropic's published (Claude 2) tokenizer, and newer Claude tokenizers count ~30% more, so 40,000 characters
 * are about 31,000–40,000 tokens — the 224-bar, 9-track canon-audio-track.gp is 38,700 characters whole. Within it every
 * bar is written out; beyond it the bars around the start bar are, and the rest is summarised section by section.
 */
export const SCORE_TEXT_BUDGET = 40000;
/** While the detailed bars grow around the start bar, this many are added before it for each one after it. */
const BARS_BEFORE_PER_BAR_AFTER = 2;
/** Bars before the start bar always written out with it, however long the score. */
const MIN_BARS_BEFORE = 2;

const SUMMARY_LEGEND =
  'Lines "Bars a-b" summarise bars not written out: per track the notes per bar, the most common duration, the pitch range, the drum keys most played.';

/** The score as text, and what it holds. */
export interface ScoreText {
  readonly text: string;
  /** The bars written out in full, 0-based, first and last; the others are summarised. */
  readonly detailFirst: number;
  readonly detailLast: number;
  readonly isSummarized: boolean;
}

function keyText(keySignature: number): string {
  return keySignature === 0
    ? 'key 0'
    : `key ${Math.abs(keySignature)}${keySignature > 0 ? '#' : 'b'}`;
}

function tempoText(tempo: number): string {
  return `♩=${Number(tempo.toFixed(2))}`;
}

/** A bar's alternate endings ("ending 1,2"). */
function endingText(header: MeasureHeader): string {
  const endings = endingNumbers(header.repeatAlternative);
  return endings.length === 0 ? '' : ` ending ${endings.join(',')}`;
}

/** "Bar 9 4/4 ♩=120 key 1# [Verse] |:": the bar's number, what changes there (all of it on `isBlockStart`), its marks. */
export function barHeading(
  song: Song,
  measureIndex: number,
  isBlockStart: boolean,
): string {
  const header = song.measureHeaders[measureIndex];
  if (header === undefined) {
    return `Bar ${measureIndex + 1}`;
  }
  const previous = isBlockStart
    ? undefined
    : song.measureHeaders[measureIndex - 1];
  const key = song.tracks[0]?.measures[measureIndex]?.keySignature ?? 0;
  const previousKey = song.tracks[0]?.measures[measureIndex - 1]?.keySignature;
  const meter = `${header.timeSignature.numerator}/${header.timeSignature.denominator}`;
  const isNewMeter =
    previous === undefined ||
    `${previous.timeSignature.numerator}/${previous.timeSignature.denominator}` !==
      meter;
  const parts = [
    `Bar ${measureIndex + 1}`,
    isNewMeter ? meter : '',
    previous === undefined || previous.tempo !== header.tempo
      ? tempoText(header.tempo)
      : '',
    previous === undefined || previousKey !== key ? keyText(key) : '',
    header.tripletFeel !== 'none' &&
    (previous === undefined || previous.tripletFeel !== header.tripletFeel)
      ? `swing ${header.tripletFeel}`
      : '',
    header.marker === undefined ? '' : `[${header.marker.title}]`,
    header.repeatOpen ? '|:' : '',
    header.repeatClose > 0 ? `:|x${repeatPlays(header)}` : '',
  ];
  return `${parts.filter(part => part !== '').join(' ')}${endingText(header)}`;
}

/** The score's bars as text: each bar's track lines and headings worked out once, the summaries' stats once. */
class ScoreWriter implements BarSource {
  private readonly trackLines = new Map<number, readonly TrackLine[]>();
  private readonly headings = new Map<string, string>();
  private stats?: ScoreStats;

  constructor(
    private readonly song: Song,
    private readonly notations: readonly TrackNotation[],
  ) {}

  readonly lines = (measureIndex: number): readonly TrackLine[] => {
    const kept = this.trackLines.get(measureIndex);
    if (kept !== undefined) {
      return kept;
    }
    const lines = this.notations.flatMap((notation) => {
      const text = trackBarText(this.song, notation, measureIndex);
      return text === undefined ? [] : [{ trackIndex: notation.trackIndex, text }];
    });
    this.trackLines.set(measureIndex, lines);
    return lines;
  };

  readonly headingLength = (measureIndex: number, isBlockStart: boolean): number => this.heading(measureIndex, isBlockStart).length;

  /**
   * Bars `first` to `last` written out: each bar's heading and a line per track that plays, "=N" for a track playing
   * what it played in bar N of these bars.
   */
  bars(first: number, last: number): readonly string[] {
    const seen = new Map<string, number>();
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
      const measureIndex = first + offset;
      const body = this.lines(measureIndex).map(({ trackIndex, text }) => {
        const key = `${trackIndex}:${text}`;
        const earlier = seen.get(key);
        seen.set(key, earlier ?? measureIndex);
        return `${trackIndex}: ${earlier === undefined ? text : `=${earlier + 1}`}`;
      });
      return `${this.heading(measureIndex, offset === 0)}${body.length === 0 ? ALL_REST : `\n${body.join('\n')}`}`;
    });
  }

  /** The summary lines on the grid of `level`. */
  summaries(level: number): SummaryLengths {
    this.stats ??= scoreStats(this.song, this.notations);
    const stats = this.stats;
    return new SummaryLengths(summaryGrid(this.song, level), (span) => summaryLine(this.song, this.notations, stats, span, spanHeading(this.song, span[0])));
  }

  private heading(measureIndex: number, isBlockStart: boolean): string {
    const key = `${measureIndex}:${isBlockStart}`;
    const kept = this.headings.get(key) ?? barHeading(this.song, measureIndex, isBlockStart);
    this.headings.set(key, kept);
    return kept;
  }
}

/** A summary's heading: the section's name and its meter, tempo and key at its first bar. */
function spanHeading(song: Song, first: number): string {
  return barHeading(song, first, true).replace(/^Bar \d+ ?/, '').trim() || '-';
}

/** The whole score written out, when it fits in `room`: found bar by bar, stopping as soon as it does not. */
function wholeFits(writer: ScoreWriter, barCount: number, room: number): boolean {
  const detail = new DetailLength(writer, 0);
  while (detail.last < barCount - 1 && detail.length() + detail.costAfter() <= room) {
    detail.addAfter();
  }
  return detail.last === barCount - 1 && detail.length() <= room;
}

/** The text length of a window written out and the summaries around it. */
function windowLength(summaries: SummaryLengths, barCount: number, first: number, last: number, detailLength: number): number {
  return summaries.length(0, first - 1) + detailLength + summaries.length(last + 1, barCount - 1);
}

/** The window written out at least: the anchor to `last`, and up to MIN_BARS_BEFORE bars before the anchor. */
function minimumWindow(writer: ScoreWriter, anchor: number, last: number): DetailLength {
  const detail = new DetailLength(writer, anchor);
  while (detail.first > 0 && anchor - detail.first < MIN_BARS_BEFORE) {
    detail.addBefore();
  }
  while (detail.last < last) {
    detail.addAfter();
  }
  return detail;
}

/** The finest summary grid whose lines, around the minimum window, fit in `room` (else the coarsest). */
function chooseSummaries(writer: ScoreWriter, song: Song, detail: DetailLength, room: number): SummaryLengths {
  const barCount = song.measureHeaders.length;
  for (let level = 0; ; level++) {
    const summaries = writer.summaries(level);
    if (isCoarsestGrid(song, level) || windowLength(summaries, barCount, detail.first, detail.last, detail.length()) <= room) {
      return summaries;
    }
  }
}

/** A way to grow the window: what it would then take, and the growing. */
type Grow = readonly [length: number, grow: () => void];

/** The window grown around the start: a bar more before it (BARS_BEFORE_PER_BAR_AFTER at a time) or after it while one fits. */
function growWindow(detail: DetailLength, summaries: SummaryLengths, barCount: number, room: number): void {
  for (let step = 0; ; step++) {
    const before = detail.first > 0 ? windowLength(summaries, barCount, detail.first - 1, detail.last, detail.length() + detail.costBefore()) : Infinity;
    const after = detail.last < barCount - 1 ? windowLength(summaries, barCount, detail.first, detail.last + 1, detail.length() + detail.costAfter()) : Infinity;
    const isBeforeDue = step % (BARS_BEFORE_PER_BAR_AFTER + 1) !== BARS_BEFORE_PER_BAR_AFTER;
    const beforeGrow: Grow = [before, () => detail.addBefore()];
    const afterGrow: Grow = [after, () => detail.addAfter()];
    const grow = (isBeforeDue ? [beforeGrow, afterGrow] : [afterGrow, beforeGrow]).find(([length]) => length <= room);
    if (grow === undefined) {
      return;
    }
    grow[1]();
  }
}

/**
 * The whole score as text for a compose request: every bar of every track (bar-major: a heading with the meter, tempo and
 * key where they change, sections and repeats, then a line per track that plays). When that is longer than `budget`
 * characters, the start bar and MIN_BARS_BEFORE bars before it are written out, the window growing — two bars before it
 * for each one after — as far as the budget allows, and every other stretch is summarised a section (or SUMMARY_BARS) at
 * a time, coarser stretches when even that is too long. Lengths are counted as bars join, so a long score costs about
 * what the budget does, not its own length. `lastIndex` (AI Edit's range) is written out with the start bar whatever
 * the budget: the caller keeps such a range short.
 */
export function describeScore(song: Song, startIndex: number, budget = SCORE_TEXT_BUDGET, lastIndex = startIndex): ScoreText {
  const barCount = song.measureHeaders.length;
  const writer = new ScoreWriter(
    song,
    song.tracks.map((_, trackIndex) => trackNotationOf(song, trackIndex)),
  );
  if (barCount === 0 || wholeFits(writer, barCount, budget - NOTATION_LEGEND.length - 1)) {
    return { text: [NOTATION_LEGEND, ...writer.bars(0, barCount - 1)].join('\n'), detailFirst: 0, detailLast: barCount - 1, isSummarized: false };
  }
  const room = budget - NOTATION_LEGEND.length - SUMMARY_LEGEND.length - 2;
  const anchor = Math.max(0, Math.min(startIndex, barCount - 1));
  const detail = minimumWindow(writer, anchor, Math.max(anchor, Math.min(lastIndex, barCount - 1)));
  const summaries = chooseSummaries(writer, song, detail, room);
  growWindow(detail, summaries, barCount, room);
  const { first, last } = detail;
  const lines = [...summaries.lines(0, first - 1), ...writer.bars(first, last), ...summaries.lines(last + 1, barCount - 1)];
  return { text: [NOTATION_LEGEND, SUMMARY_LEGEND, ...lines].join('\n'), detailFirst: first, detailLast: last, isSummarized: first > 0 || last < barCount - 1 };
}
