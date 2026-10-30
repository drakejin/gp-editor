// i18n-exempt-file: the score written as text for Claude's prompt, never shown
import type { MeasureHeader, Song } from '@gp-editor/core';
import { endingNumbers } from '../score/heading';
import {
  NOTATION_LEGEND,
  type TrackNotation,
  trackBarText,
  trackNotationOf,
} from './score-notation';
import {
  type ScoreStats,
  scoreStats,
  summaryLine,
  summarySpans,
} from './score-summary';

/**
 * Characters of score text a request carries at most. Measured on the fixtures: this notation runs ~1.3 characters a
 * token by Anthropic's published (Claude 2) tokenizer, and newer Claude tokenizers count ~30% more, so 40,000 characters
 * are about 31,000–40,000 tokens — the 224-bar, 9-track canon-audio-track.gp is 38,700 characters whole. Within it every
 * bar is written out; beyond it the bars around the start bar are, and the rest is summarised section by section.
 */
export const SCORE_TEXT_BUDGET = 40000;
/** While the detailed bars grow around the start bar, this many are added before it for each one after it. */
const BARS_BEFORE_PER_BAR_AFTER = 2;

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
    header.repeatClose > 0 ? `:|x${header.repeatClose + 1}` : '',
  ];
  return `${parts.filter(part => part !== '').join(' ')}${endingText(header)}`;
}

/** A track's line in a bar: its index and what it plays. */
interface TrackLine {
  readonly trackIndex: number;
  readonly text: string;
}

/** The score's bars as text, each track's line computed once, and the summaries' stats. */
class ScoreWriter {
  private readonly lines = new Map<number, readonly TrackLine[]>();
  private stats?: ScoreStats;

  constructor(
    private readonly song: Song,
    private readonly notations: readonly TrackNotation[],
  ) {}

  private trackLines(measureIndex: number): readonly TrackLine[] {
    const kept = this.lines.get(measureIndex);
    if (kept !== undefined) {
      return kept;
    }
    const lines = this.notations.flatMap(notation => {
      const text = trackBarText(this.song, notation, measureIndex);
      return text === undefined
        ? []
        : [{ trackIndex: notation.trackIndex, text }];
    });
    this.lines.set(measureIndex, lines);
    return lines;
  }

  /**
   * Bars `first` to `last` written out: each bar's heading and a line per track that plays, "=N" for a track playing
   * what it played in bar N of these bars.
   */
  bars(first: number, last: number): readonly string[] {
    const seen = new Map<string, number>();
    return Array.from(
      { length: Math.max(0, last - first + 1) },
      (_, offset) => {
        const measureIndex = first + offset;
        const body = this.trackLines(measureIndex).map(
          ({ trackIndex, text }) => {
            const key = `${trackIndex}:${text}`;
            const earlier = seen.get(key);
            seen.set(key, earlier ?? measureIndex);
            return `${trackIndex}: ${
              earlier === undefined ? text : `=${earlier + 1}`
            }`;
          },
        );
        return `${barHeading(this.song, measureIndex, offset === 0)}${
          body.length === 0 ? ' (all rest)' : `\n${body.join('\n')}`
        }`;
      },
    );
  }

  summaries(first: number, last: number): readonly string[] {
    this.stats ??= scoreStats(this.song, this.notations);
    const stats = this.stats;
    return summarySpans(this.song, first, last).map(span =>
      summaryLine(
        this.song,
        this.notations,
        stats,
        span,
        spanHeading(this.song, span[0]),
      ),
    );
  }
}

/** A summary's heading: the section's name and its meter, tempo and key at its first bar. */
function spanHeading(song: Song, first: number): string {
  return (
    barHeading(song, first, true)
      .replace(/^Bar \d+ ?/, '')
      .trim() || '-'
  );
}

function joinedLength(lines: readonly string[]): number {
  return lines.reduce((total, line) => total + line.length + 1, 0);
}

interface Window {
  readonly first: number;
  readonly last: number;
}

/** The window's text: the bars before it summarised, its bars written out, the bars after it summarised. */
function windowLines(
  writer: ScoreWriter,
  barCount: number,
  { first, last }: Window,
): readonly string[] {
  return [
    ...writer.summaries(0, first - 1),
    ...writer.bars(first, last),
    ...writer.summaries(last + 1, barCount - 1),
  ];
}

/** The next window: a bar more before the start (BARS_BEFORE_PER_BAR_AFTER at a time) or after it, whichever is due and fits. */
function grow(
  writer: ScoreWriter,
  barCount: number,
  window: Window,
  budget: number,
  step: number,
): Window | undefined {
  const before = { first: window.first - 1, last: window.last };
  const after = { first: window.first, last: window.last + 1 };
  const isBeforeDue =
    step % (BARS_BEFORE_PER_BAR_AFTER + 1) !== BARS_BEFORE_PER_BAR_AFTER;
  const candidates = (isBeforeDue ? [before, after] : [after, before]).filter(
    candidate => candidate.first >= 0 && candidate.last < barCount,
  );
  return candidates.find(
    candidate =>
      joinedLength(windowLines(writer, barCount, candidate)) <= budget,
  );
}

/**
 * The whole score as text for a compose request: every bar of every track (bar-major: a heading with the meter, tempo and
 * key where they change, sections and repeats, then a line per track that plays). When that is longer than `budget`
 * characters, the bars around `startIndex` are written out — growing two bars before it for each one after — as far as
 * the budget allows, and every other stretch is summarised a section (or SUMMARY_BARS) at a time.
 */
export function describeScore(
  song: Song,
  startIndex: number,
  budget = SCORE_TEXT_BUDGET,
): ScoreText {
  const barCount = song.measureHeaders.length;
  const writer = new ScoreWriter(
    song,
    song.tracks.map((_, trackIndex) => trackNotationOf(song, trackIndex)),
  );
  const whole = writer.bars(0, barCount - 1);
  if (
    joinedLength(whole) + NOTATION_LEGEND.length <= budget ||
    barCount === 0
  ) {
    return {
      text: [NOTATION_LEGEND, ...whole].join('\n'),
      detailFirst: 0,
      detailLast: barCount - 1,
      isSummarized: false,
    };
  }
  const anchor = Math.max(0, Math.min(startIndex, barCount - 1));
  const room = budget - NOTATION_LEGEND.length - SUMMARY_LEGEND.length;
  let window: Window = { first: anchor, last: anchor };
  for (let step = 0; ; step++) {
    const next = grow(writer, barCount, window, room, step);
    if (next === undefined) {
      break;
    }
    window = next;
  }
  const text = [
    NOTATION_LEGEND,
    SUMMARY_LEGEND,
    ...windowLines(writer, barCount, window),
  ].join('\n');
  return {
    text,
    detailFirst: window.first,
    detailLast: window.last,
    isSummarized: true,
  };
}
