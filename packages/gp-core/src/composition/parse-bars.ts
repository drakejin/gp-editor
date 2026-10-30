import { CompositionError } from '../errors';
import { instrumentWarning, parseTrack } from '../transcription/parse-track';
import { parseTranscribedMeasure } from '../transcription/parse-page';
import { type RawObject, isRawObject, readList, readOptionalList, toText, withoutUndefined } from '../transcription/parse-values';
import { MAX_TRANSCRIBED_TRACKS, type TranscribedMeasure, type TranscribedTrack } from '../transcription/types';
import { countOf } from '../transcription/wording';
import { type ComposeScope, type ComposedBars, MAX_COMPOSED_BARS, MAX_COMPOSED_NEW_TRACKS } from './compose-types';

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

/** A part's track index, when the part is an object with an integer one; anything else is left to the measure parser. */
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

/** The bar with only the parts for writable tracks (before the measure parser sees it), and the tracks left out. */
function keepWritableParts(bar: RawObject, writable: ReadonlySet<number>, trackCount: number): { readonly bar: RawObject; readonly leftOut: ReadonlyMap<number, LeftOutReason> } {
  const parts = Array.isArray(bar.parts) ? (bar.parts as readonly unknown[]) : undefined;
  if (parts === undefined) {
    return { bar, leftOut: new Map() };
  }
  const leftOut = new Map<number, LeftOutReason>();
  const kept = parts.filter((part) => {
    const track = partTrack(part);
    const reason = track === undefined ? undefined : leftOutReason(track, writable, trackCount);
    if (track !== undefined && reason !== undefined) {
      leftOut.set(track, reason);
    }
    return reason === undefined;
  });
  return { bar: { ...bar, parts: kept }, leftOut };
}

/** A bar of the tool: its meter, tempo and key where set, and its parts (repeats, endings and lyrics are not the tool's). */
function toComposedBar({ timeSignature, tempo, keySignature, parts }: TranscribedMeasure): TranscribedMeasure {
  return withoutUndefined({ timeSignature, tempo, keySignature, parts });
}

function trackLabel(scope: ComposeScope, track: number): string {
  const name = scope.trackNames[track]?.trim() ?? '';
  return name === '' ? `Track ${track + 1}` : `Track ${track + 1} (${name})`;
}

function leftOutWarning(scope: ComposeScope, { track, reason, bars }: LeftOut): string {
  const why = reason === 'notWritable' ? 'not one of the tracks to write' : 'no such track';
  return `${trackLabel(scope, track)}: its parts in ${countOf(bars, 'bar')} were left out (${why})`;
}

interface ParsedBars {
  readonly bars: readonly TranscribedMeasure[];
  readonly warnings: readonly string[];
}

function parseBars(value: unknown, scope: ComposeScope, newTrackCount: number): ParsedBars {
  const raw = readList(value, 'bars');
  const maxBars = Math.max(0, Math.min(MAX_COMPOSED_BARS, scope.maxBars));
  const writable = new Set([...scope.writableTracks, ...Array.from({ length: newTrackCount }, (_, index) => scope.trackCount + index)]);
  const leftOut = new Map<number, LeftOut>();
  const bars = raw.slice(0, maxBars).map((bar, index) => {
    const kept = keepWritableParts(isRawObject(bar) ? bar : {}, writable, scope.trackCount + newTrackCount);
    kept.leftOut.forEach((reason, track) => leftOut.set(track, { track, reason, bars: (leftOut.get(track)?.bars ?? 0) + 1 }));
    return toComposedBar(parseTranscribedMeasure(isRawObject(bar) ? kept.bar : bar, `bars[${index}]`, undefined));
  });
  const capWarning = raw.length > maxBars ? [`${countOf(raw.length, 'bar')} written: the last ${raw.length - maxBars} were left out (at most ${maxBars})`] : [];
  return { bars, warnings: [...capWarning, ...[...leftOut.values()].map((item) => leftOutWarning(scope, item))] };
}

function parseWarnings(value: unknown): readonly string[] {
  const warnings: readonly unknown[] = Array.isArray(value) ? value : [];
  return warnings.flatMap((warning) => toText(warning) ?? []);
}

/**
 * Checks a model's WRITE_BARS_TOOL answer against what the user allowed: new tracks only when allowed (and capped),
 * parts only for the tracks to write and the new tracks (others left out, a warning per track), at most `maxBars` bars;
 * each bar read as the PDF import reads a measure, keeping its meter, tempo, key and parts. An answer without bars is
 * nothing written (its warnings say why). Throws a CompositionError for an answer that is not an object, and the
 * transcription's TranscriptionError for bars it cannot read (a beat without a duration, a note without a pitch …).
 */
export function parseComposedBars(value: unknown, scope: ComposeScope): ComposedBars {
  if (!isRawObject(value)) {
    throw new CompositionError('answer: expected an object');
  }
  const newTracks = parseNewTracks(value.newTracks, scope);
  const bars = parseBars(value.bars, scope, newTracks.tracks.length);
  return { bars: bars.bars, newTracks: newTracks.tracks, warnings: [...parseWarnings(value.warnings), ...newTracks.warnings, ...bars.warnings] };
}
