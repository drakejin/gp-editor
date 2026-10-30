// i18n-exempt-file: the score summarised as text for Claude's prompt, never shown
import type { Song } from '@gp-editor/core';
import { pitchNameInKey } from '../lib/pitch';
import { type TrackNotation, durationCode } from './score-notation';

/** A stretch without a section marker is summarised this many bars at a time. */
const SUMMARY_BARS = 8;
/** Chord names a summary lists at most. */
const MAX_SUMMARY_CHORDS = 12;
/** Drum keys a summary lists at most (the most played first). */
const MAX_SUMMARY_DRUMS = 5;

/** What one track plays in one bar, for the summaries. */
interface TrackBarStats {
  readonly notes: number;
  /** How many beats with notes start with each duration code. */
  readonly durations: ReadonlyMap<string, number>;
  /** Lowest and highest pitch as the score text writes it (drums: their keys). */
  readonly low?: number;
  readonly high?: number;
  /** Drums: how often each key is struck. */
  readonly drums: ReadonlyMap<number, number>;
}

/** Every bar's stats per track, and its chord names in order; worked out once per score text. */
export interface ScoreStats {
  readonly bars: readonly (readonly TrackBarStats[])[];
  readonly chords: readonly (readonly string[])[];
}

function addCount<K>(counts: Map<K, number>, key: K, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

function trackBarStats(
  song: Song,
  notation: TrackNotation,
  measureIndex: number,
): TrackBarStats {
  const durations = new Map<string, number>();
  const drums = new Map<number, number>();
  const pitches: number[] = [];
  for (const beat of song.tracks[notation.trackIndex]?.measures[measureIndex]
    ?.beats ?? []) {
    for (const voice of beat.voices.filter(
      candidate => !candidate.isEmpty && candidate.notes.length > 0,
    )) {
      addCount(durations, durationCode(voice.duration));
      for (const note of voice.notes) {
        if (notation.instrument === 'drums') {
          addCount(drums, note.fret);
        } else {
          pitches.push(
            (notation.tuning[note.string - 1] ?? 0) +
              notation.capo +
              note.fret +
              notation.writtenAbove,
          );
        }
      }
    }
  }
  const notes =
    pitches.length + [...drums.values()].reduce((sum, count) => sum + count, 0);
  const range =
    pitches.length === 0
      ? {}
      : { low: Math.min(...pitches), high: Math.max(...pitches) };
  return { notes, durations, drums, ...range };
}

function barChords(song: Song, measureIndex: number): readonly string[] {
  return song.tracks.flatMap(track =>
    (track.measures[measureIndex]?.beats ?? []).flatMap(
      beat => beat.chord?.name.trim() || [],
    ),
  );
}

export function scoreStats(
  song: Song,
  notations: readonly TrackNotation[],
): ScoreStats {
  return {
    bars: song.measureHeaders.map((_, measureIndex) =>
      notations.map(notation => trackBarStats(song, notation, measureIndex)),
    ),
    chords: song.measureHeaders.map((_, measureIndex) =>
      barChords(song, measureIndex),
    ),
  };
}

/** The stretches [first, last] of bars to summarise: split where a section marker starts, then SUMMARY_BARS at a time. */
export function summarySpans(
  song: Song,
  first: number,
  last: number,
): readonly (readonly [number, number])[] {
  const spans: [number, number][] = [];
  let spanStart = first;
  for (let index = first; index <= last; index++) {
    const isSectionStart =
      index > spanStart && song.measureHeaders[index]?.marker !== undefined;
    if (isSectionStart || index - spanStart === SUMMARY_BARS) {
      spans.push([spanStart, index - 1]);
      spanStart = index;
    }
  }
  return last < first ? [] : [...spans, [spanStart, last]];
}

function mostCommon<K>(counts: ReadonlyMap<K, number>): K | undefined {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** "0: 5.2 notes/bar, mostly e, E3-A4" or "3: 12.0 notes/bar, mostly s, drums 42 36 38"; undefined when it rests. */
function trackSummary(
  notation: TrackNotation,
  stats: readonly TrackBarStats[],
  barCount: number,
  keySignature: number,
): string | undefined {
  const notes = stats.reduce((sum, bar) => sum + bar.notes, 0);
  if (notes === 0) {
    return undefined;
  }
  const durations = new Map<string, number>();
  const drums = new Map<number, number>();
  stats.forEach(bar => {
    bar.durations.forEach((count, code) => addCount(durations, code, count));
    bar.drums.forEach((count, key) => addCount(drums, key, count));
  });
  const lows = stats.flatMap(bar => bar.low ?? []);
  const highs = stats.flatMap(bar => bar.high ?? []);
  const range =
    lows.length === 0
      ? ''
      : `, ${pitchNameInKey(Math.min(...lows), keySignature)}-${pitchNameInKey(
          Math.max(...highs),
          keySignature,
        )}`;
  const kit =
    drums.size === 0
      ? ''
      : `, drums ${[...drums.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_SUMMARY_DRUMS)
          .map(([key]) => key)
          .join(' ')}`;
  return `${notation.trackIndex}: ${(notes / barCount).toFixed(
    1,
  )} notes/bar, mostly ${mostCommon(durations) ?? '?'}${range}${kit}`;
}

/** Chord names in order, a name repeated right after itself once. */
function spanChords(stats: ScoreStats, first: number, last: number): string {
  const names = stats.chords
    .slice(first, last + 1)
    .flat()
    .filter((name, index, all) => index === 0 || all[index - 1] !== name);
  return names.length === 0
    ? ''
    : ` chords ${names.slice(0, MAX_SUMMARY_CHORDS).join(' ')}${
        names.length > MAX_SUMMARY_CHORDS ? ' …' : ''
      };`;
}

/** One summary line: "Bars 1-8 [Intro] 4/4 ♩=120 key 1#: chords Am F; 0: …; 3: …" ("all rest" when nothing plays). */
export function summaryLine(
  song: Song,
  notations: readonly TrackNotation[],
  stats: ScoreStats,
  [first, last]: readonly [number, number],
  heading: string,
): string {
  const keySignature = song.tracks[0]?.measures[first]?.keySignature ?? 0;
  const barCount = last - first + 1;
  const tracks = notations.flatMap(
    (notation, index) =>
      trackSummary(
        notation,
        stats.bars.slice(first, last + 1).map(bar => bar[index] ?? EMPTY_STATS),
        barCount,
        keySignature,
      ) ?? [],
  );
  const body = tracks.length === 0 ? ' all rest' : ` ${tracks.join('; ')}`;
  return `Bars ${first + 1}-${last + 1} ${heading}:${spanChords(
    stats,
    first,
    last,
  )}${body}`;
}

const EMPTY_STATS: TrackBarStats = {
  notes: 0,
  durations: new Map(),
  drums: new Map(),
};
