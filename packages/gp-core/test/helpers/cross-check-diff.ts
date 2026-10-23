import type { ScoreView, TrackView } from './cross-check-view';

/** One field where alphaTab read something else than gp-core's song holds. */
export interface ViewDifference {
  /** e.g. `score.tracks[0].bars[3].voices[0][2].notes[1].effects` */
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

/** Where a difference is: the indexes its path names (absent when the path does not reach that far). */
export interface DifferenceLocation {
  readonly track?: number;
  readonly bar?: number;
  readonly voice?: number;
  readonly beat?: number;
  readonly note?: number;
  /** The last field of the path, e.g. `effects`, `fret`, `tuning`, `length`. */
  readonly field: string;
}

const INDEXES = /^score(?:\.tracks\[(\d+)\](?:\.bars\[(\d+)\](?:\.voices\[(\d+)\](?:\[(\d+)\](?:\.notes\[(\d+)\])?)?)?)?)?/;

const optionalIndex = (text: string | undefined): number | undefined => (text === undefined ? undefined : Number(text));

export function locate(path: string): DifferenceLocation {
  const match = INDEXES.exec(path);
  const field = path.slice(path.lastIndexOf('.') + 1);
  return {
    track: optionalIndex(match?.[1]),
    bar: optionalIndex(match?.[2]),
    voice: optionalIndex(match?.[3]),
    beat: optionalIndex(match?.[4]),
    note: optionalIndex(match?.[5]),
    field,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalarList(value: readonly unknown[]): boolean {
  return value.every((item) => typeof item !== 'object' || item === null);
}

function arrayDifferences(expected: readonly unknown[], actual: readonly unknown[], path: string): ViewDifference[] {
  if (isScalarList(expected) && isScalarList(actual)) {
    const isSame = expected.length === actual.length && expected.every((item, index) => item === actual[index]);
    return isSame ? [] : [{ path, expected, actual }];
  }
  if (expected.length !== actual.length) {
    return [{ path: `${path}.length`, expected: expected.length, actual: actual.length }];
  }
  return expected.flatMap((item, index) => differences(item, actual[index], `${path}[${index}]`));
}

function recordDifferences(expected: Readonly<Record<string, unknown>>, actual: Readonly<Record<string, unknown>>, path: string): ViewDifference[] {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
  return keys.flatMap((key) => differences(expected[key], actual[key], `${path}.${key}`));
}

function differences(expected: unknown, actual: unknown, path: string): ViewDifference[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return arrayDifferences(expected, actual, path);
  }
  if (isRecord(expected) && isRecord(actual)) {
    return recordDifferences(expected, actual, path);
  }
  return Object.is(expected, actual) ? [] : [{ path, expected, actual }];
}

function hasSungBeat(track: TrackView): boolean {
  return track.bars.some((bar) => (bar.voices[0] ?? []).some((beat) => beat.notes.length > 0));
}

/**
 * alphaTab gives the lyrics' syllables to the first voice's beats with notes and drops the rest: what it holds must be
 * the start of gp-core's text, and only a track with no such beat may have none.
 */
function withReadLyrics(expected: TrackView, read: TrackView | undefined): TrackView {
  if (read === undefined || !expected.lyrics.startsWith(read.lyrics)) {
    return expected;
  }
  return read.lyrics !== '' || !hasSungBeat(expected) ? { ...expected, lyrics: read.lyrics } : expected;
}

/** Every field where `actual` (alphaTab's reading) differs from `expected` (gp-core's song); arrays of different lengths are one difference. */
export function viewDifferences(expected: ScoreView, actual: ScoreView): ViewDifference[] {
  const tracks = expected.tracks.map((track, index) => withReadLyrics(track, actual.tracks[index]));
  return differences({ ...expected, tracks }, actual, 'score');
}
