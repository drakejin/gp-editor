import { CompositionError, TranscriptionError } from '../errors';
import { instrumentWarning, parseTrack } from '../transcription/parse-track';
import { parseTranscribedMeasure, parseTranscribedPart } from '../transcription/parse-page';
import { isRawObject, readList, readObject, readOptionalList, toText, withoutUndefined } from '../transcription/parse-values';
import { MAX_TRANSCRIBED_PARTS, MAX_TRANSCRIBED_TRACKS, type TranscribedMeasure, type TranscribedPart, type TranscribedTrack } from '../transcription/types';
import { countOf } from '../transcription/wording';
import {
  type ComposeScope,
  type ComposedBars,
  MAX_BROKEN_PARTS_NAMED,
  MAX_COMPOSED_BARS,
  MAX_COMPOSED_NEW_TRACKS,
  MAX_COMPOSE_WARNINGS,
  MAX_COMPOSE_WARNING_LENGTH,
  MAX_LEFT_OUT_TRACKS_NAMED,
} from './compose-types';

interface ParsedTracks {
  readonly tracks: readonly TranscribedTrack[];
  readonly warnings: readonly string[];
}

/** The new tracks the scope allows: none unless allowed, at most MAX_COMPOSED_NEW_TRACKS, within the contract's indexes. */
function parseNewTracks(value: unknown, scope: ComposeScope): ParsedTracks {
  const raw = readOptionalList(value, 'newTracks');
  if (raw.length === 0) {
    return { tracks: [], warnings: [] };
  }
  if (!scope.allowsNewTracks) {
    return { tracks: [], warnings: [`New tracks were not allowed: ${countOf(raw.length, 'new track')} left out`] };
  }
  const room = Math.max(0, Math.min(MAX_COMPOSED_NEW_TRACKS, MAX_TRANSCRIBED_TRACKS - scope.trackCount));
  const kept = raw.slice(0, room);
  const tracks = kept.map((track, index) => parseTrack(track, `newTracks[${index}]`));
  const instrumentWarnings = tracks.flatMap((track, index) => {
    const entry = kept[index];
    return instrumentWarning(isRawObject(entry) ? entry.instrument : undefined, track, scope.trackCount + index) ?? [];
  });
  const capWarning = raw.length > room ? [`${countOf(raw.length, 'new track')} given: the last ${raw.length - room} were left out (at most ${room})`] : [];
  return { tracks, warnings: [...capWarning, ...instrumentWarnings] };
}

/** Why a track's parts were left out: one the answer may not write, or one that is not there. */
type LeftOutReason = 'notWritable' | 'noSuchTrack';

interface LeftOut {
  readonly track: number;
  readonly reason: LeftOutReason;
  /** Bars with a part for it. */
  readonly bars: number;
}

/** A part's track index, when the part is an object with an integer one; anything else is left to the part parser. */
function partTrack(part: unknown): number | undefined {
  const track = isRawObject(part) ? part.track : undefined;
  return typeof track === 'number' && Number.isInteger(track) ? track : undefined;
}

function leftOutReason(track: number, writable: ReadonlySet<number>, trackCount: number): LeftOutReason | undefined {
  if (writable.has(track)) {
    return undefined;
  }
  return track >= 0 && track < trackCount ? 'notWritable' : 'noSuchTrack';
}

/** A bar of the tool: its meter, tempo and key where set, and its parts (repeats, endings and lyrics are not the tool's). */
function toComposedBar({ timeSignature, tempo, keySignature }: TranscribedMeasure, parts: readonly TranscribedPart[]): TranscribedMeasure {
  return withoutUndefined({ timeSignature, tempo, keySignature, parts });
}

function trackLabel(scope: ComposeScope, track: number): string {
  const name = scope.trackNames[track]?.trim() ?? '';
  return name === '' ? `Track ${track + 1}` : `Track ${track + 1} (${name})`;
}

function leftOutWarnings(scope: ComposeScope, leftOut: readonly LeftOut[]): readonly string[] {
  const named = leftOut.slice(0, MAX_LEFT_OUT_TRACKS_NAMED).map(({ track, reason, bars }) => {
    const why = reason === 'notWritable' ? 'not one of the tracks to write' : 'no such track';
    return `${trackLabel(scope, track)}: its parts in ${countOf(bars, 'bar')} were left out (${why})`;
  });
  const more = leftOut.length - named.length;
  return more > 0 ? [...named, `Parts for ${countOf(more, 'more track')} were left out`] : named;
}

function brokenWarnings(broken: readonly string[]): readonly string[] {
  const named = broken.slice(0, MAX_BROKEN_PARTS_NAMED).map((message) => `${message} — the part was left out`);
  const more = broken.length - named.length;
  return more > 0 ? [...named, `${countOf(more, 'more part')} could not be read and were left out`] : named;
}

/** What reading the bars left out: parts by track (outside the scope or not there), and parts that could not be read. */
interface BarsReading {
  readonly writable: ReadonlySet<number>;
  /** The song's tracks and the new ones. */
  readonly trackCount: number;
  readonly leftOut: Map<number, LeftOut>;
  readonly broken: string[];
}

/** One part of a writable track, read; undefined (with the reason kept) when it is outside the scope or unreadable. */
function readPart(part: unknown, path: string, reading: BarsReading): TranscribedPart | undefined {
  const track = partTrack(part);
  const reason = track === undefined ? undefined : leftOutReason(track, reading.writable, reading.trackCount);
  if (track !== undefined && reason !== undefined) {
    reading.leftOut.set(track, { track, reason, bars: (reading.leftOut.get(track)?.bars ?? 0) + 1 });
    return undefined;
  }
  try {
    return parseTranscribedPart(part, path, reading.trackCount);
  } catch (error: unknown) {
    if (!(error instanceof TranscriptionError)) {
      throw error;
    }
    reading.broken.push(error.message);
    return undefined;
  }
}

/** A bar: its meter, tempo and key read as a measure's, its parts one by one (a part it cannot read is left out). */
function readBar(bar: unknown, index: number, reading: BarsReading): TranscribedMeasure {
  const path = `bars[${index}]`;
  const raw = readObject(bar, path);
  const parts = readOptionalList(raw.parts, `${path}.parts`).flatMap((part, partIndex) => readPart(part, `${path}.parts[${partIndex}]`, reading) ?? []);
  const kept = parts.slice(0, MAX_TRANSCRIBED_PARTS);
  if (kept.length < parts.length) {
    reading.broken.push(`${path}.parts: ${parts.length} parts (at most ${MAX_TRANSCRIBED_PARTS})`);
  }
  return toComposedBar(parseTranscribedMeasure({ ...raw, parts: [] }, path, undefined), kept);
}

interface ParsedBars {
  readonly bars: readonly TranscribedMeasure[];
  readonly warnings: readonly string[];
}

function parseBars(value: unknown, scope: ComposeScope, newTrackCount: number): ParsedBars {
  const raw = readList(value, 'bars');
  const maxBars = Math.max(0, Math.min(MAX_COMPOSED_BARS, scope.maxBars));
  const reading: BarsReading = {
    writable: new Set([...scope.writableTracks, ...Array.from({ length: newTrackCount }, (_, index) => scope.trackCount + index)]),
    trackCount: scope.trackCount + newTrackCount,
    leftOut: new Map(),
    broken: [],
  };
  const bars = raw.slice(0, maxBars).map((bar, index) => readBar(bar, index, reading));
  const capWarning = raw.length > maxBars ? [`${countOf(raw.length, 'bar')} written: the last ${raw.length - maxBars} were left out (at most ${maxBars})`] : [];
  return { bars, warnings: [...capWarning, ...leftOutWarnings(scope, [...reading.leftOut.values()]), ...brokenWarnings(reading.broken)] };
}

/** The answer's warnings: text only, at most MAX_COMPOSE_WARNINGS of them, each cut to MAX_COMPOSE_WARNING_LENGTH. */
function parseWarnings(value: unknown): readonly string[] {
  const warnings: readonly unknown[] = Array.isArray(value) ? value : [];
  const texts = warnings.flatMap((warning) => toText(warning) ?? []);
  const kept = texts.slice(0, MAX_COMPOSE_WARNINGS).map((warning) => warning.slice(0, MAX_COMPOSE_WARNING_LENGTH));
  return texts.length > kept.length ? [...kept, `${countOf(texts.length - kept.length, 'more warning')} left out`] : kept;
}

/**
 * Checks a model's WRITE_BARS_TOOL answer against what the user allowed: new tracks only when allowed (and capped),
 * parts only for the tracks to write and the new tracks (others left out, a warning per track, a few named), at most
 * `maxBars` bars; each bar's meter, tempo and key read as the PDF import reads a measure's, each part on its own — a part
 * it cannot read (a beat without a duration, a note without a pitch …) is left out with a warning, the bar's other parts
 * kept. The answer's own warnings are capped in number and length. An answer without bars is nothing written (its
 * warnings say why). Throws a CompositionError for an answer that is not an object, and the transcription's
 * TranscriptionError for bars that are not a list of objects or a bar's impossible time signature.
 */
export function parseComposedBars(value: unknown, scope: ComposeScope): ComposedBars {
  if (!isRawObject(value)) {
    throw new CompositionError('answer: expected an object');
  }
  const newTracks = parseNewTracks(value.newTracks, scope);
  const bars = parseBars(value.bars, scope, newTracks.tracks.length);
  return { bars: bars.bars, newTracks: newTracks.tracks, warnings: [...parseWarnings(value.warnings), ...newTracks.warnings, ...bars.warnings] };
}
