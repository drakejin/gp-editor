import { MAX_FRET } from '../edit/edit-song';
import { TranscriptionError } from '../errors';
import { MAX_STRINGS } from '../write/gtp-song';
import { TRANSCRIBED_DURATIONS, isTimeSignature, isTranscribedDuration, isTupletSize } from './durations';
import { isTranscribedEffect } from './note-effects';
import {
  type RawObject,
  isRawObject,
  readList,
  readObject,
  readOptionalList,
  toClampedInteger,
  toFlag,
  toPositive,
  toText,
  withoutUndefined,
} from './parse-values';
import { parsePitch } from './pitch';
import {
  MAX_TRANSCRIBED_ALTERNATE_ENDING,
  MAX_TRANSCRIBED_BEATS,
  MAX_TRANSCRIBED_CAPO,
  MAX_TRANSCRIBED_DOTS,
  MAX_TRANSCRIBED_KEY_ACCIDENTALS,
  MAX_TRANSCRIBED_MEASURES,
  MAX_TRANSCRIBED_NOTES,
  MAX_TRANSCRIBED_PARTS,
  MAX_TRANSCRIBED_REPEAT_PLAYS,
  MAX_TRANSCRIBED_SYLLABLE_LENGTH,
  MAX_TRANSCRIBED_TEMPO,
  MAX_TRANSCRIBED_TRACKS,
  MIN_TRANSCRIBED_TEMPO,
} from './types';
import type {
  TranscribedBeat,
  TranscribedEffect,
  TranscribedMeasure,
  TranscribedNote,
  TranscribedPart,
  TranscribedSongInfo,
  TranscribedTrack,
  TranscriptionPage,
} from './types';
import { countOf } from './wording';

/** The ranges of TRANSCRIPTION_TOOL's schema; values outside them are clamped. */

/** A tempo above zero, clamped to the schema's range; undefined for anything else. */
function parseTempo(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? toClampedInteger(value, MIN_TRANSCRIBED_TEMPO, MAX_TRANSCRIBED_TEMPO) : undefined;
}

function parseSongInfo(value: unknown): TranscribedSongInfo | undefined {
  if (!isRawObject(value)) {
    return undefined;
  }
  const info = withoutUndefined({
    title: toText(value.title),
    artist: toText(value.artist),
    tempo: parseTempo(value.tempo),
    lyricsTrack: toClampedInteger(value.lyricsTrack, 0, MAX_TRANSCRIBED_TRACKS - 1),
  });
  return Object.keys(info).length === 0 ? undefined : info;
}

/** A track; odd fields fall back (no name, a guitar, no tuning: standard, no capo) since the builder can do without them. */
export function parseTrack(value: unknown, path: string): TranscribedTrack {
  const track = readObject(value, path);
  const tuning = Array.isArray(track.tuning) ? track.tuning.map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : String(entry))) : [];
  return {
    name: toText(track.name) ?? '',
    instrument: track.instrument === 'bass' ? 'bass' : 'guitar',
    tuning,
    capo: toClampedInteger(track.capo, 0, MAX_TRANSCRIBED_CAPO) ?? 0,
  };
}

function parseTracks(value: unknown): readonly TranscribedTrack[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const tracks = readList(value, 'tracks');
  if (tracks.length > MAX_TRANSCRIBED_TRACKS) {
    throw new TranscriptionError(`tracks: ${tracks.length} tracks (a transcription holds at most ${MAX_TRANSCRIBED_TRACKS} tracks)`);
  }
  return tracks.map((track, index) => parseTrack(track, `tracks[${index}]`));
}

/** Known effects in the order given, each once; anything else is left out. */
function parseEffects(value: unknown): readonly TranscribedEffect[] {
  const effects: readonly unknown[] = Array.isArray(value) ? value : [];
  return effects.filter(isTranscribedEffect).filter((effect, index, all) => all.indexOf(effect) === index);
}

/** A note needs a tab string and fret, or a written pitch it can read (the tab wins when it has both). */
function parseNote(value: unknown, path: string): TranscribedNote {
  const note = readObject(value, path);
  const string = toClampedInteger(note.string, 1, MAX_STRINGS);
  const fret = toClampedInteger(note.fret, 0, MAX_FRET);
  const pitch = typeof note.pitch === 'string' && parsePitch(note.pitch) !== undefined ? note.pitch.trim() : undefined;
  const hasTab = string !== undefined && fret !== undefined;
  if (!hasTab && pitch === undefined) {
    throw new TranscriptionError(`${path}: expected a string and fret, or a pitch such as "C#4"`);
  }
  const effects = parseEffects(note.effects);
  return withoutUndefined({
    ...(hasTab ? { string, fret } : {}),
    pitch,
    tied: toFlag(note.tied),
    effects: effects.length === 0 ? undefined : effects,
  });
}

/** A beat needs a duration; a beat marked as a rest keeps no notes. */
function parseBeat(value: unknown, path: string): TranscribedBeat {
  const beat = readObject(value, path);
  const duration = beat.duration;
  if (!isTranscribedDuration(duration)) {
    throw new TranscriptionError(`${path}.duration: expected one of ${TRANSCRIBED_DURATIONS.join(', ')}`);
  }
  const rest = toFlag(beat.rest);
  const notes = rest ? [] : readOptionalList(beat.notes, `${path}.notes`, MAX_TRANSCRIBED_NOTES).map((note, index) => parseNote(note, `${path}.notes[${index}]`));
  return withoutUndefined({
    duration,
    dots: toPositive(toClampedInteger(beat.dots, 0, MAX_TRANSCRIBED_DOTS)),
    tuplet: typeof beat.tuplet === 'number' && isTupletSize(beat.tuplet) ? beat.tuplet : undefined,
    rest,
    notes: notes.length === 0 ? undefined : notes,
  });
}

/** A part's track index: 0…MAX_TRANSCRIBED_TRACKS − 1, and below the page's track count when the page lists tracks. */
function parseTrackIndex(value: unknown, path: string, trackCount: number | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TranscriptionError(`${path}: expected a track index (0 or more)`);
  }
  if (value >= MAX_TRANSCRIBED_TRACKS) {
    throw new TranscriptionError(`${path}: ${value} is out of range (a transcription holds at most ${MAX_TRANSCRIBED_TRACKS} tracks)`);
  }
  if (trackCount !== undefined && value >= trackCount) {
    throw new TranscriptionError(`${path}: ${value} is out of range (the page lists ${countOf(trackCount, 'track')})`);
  }
  return value;
}

function parsePart(value: unknown, path: string, trackCount: number | undefined): TranscribedPart {
  const part = readObject(value, path);
  const track = parseTrackIndex(part.track, `${path}.track`, trackCount);
  const beats = readList(part.beats, `${path}.beats`, MAX_TRANSCRIBED_BEATS).map((beat, index) => parseBeat(beat, `${path}.beats[${index}]`));
  return { track, beats };
}

/**
 * A measure's syllables: trimmed and cut to MAX_TRANSCRIBED_SYLLABLE_LENGTH; spaces inside one become no-break spaces,
 * since a space separates syllables in Guitar Pro's lyrics; anything but text is a note without a syllable ("").
 */
function parseLyrics(value: unknown, path: string): readonly string[] | undefined {
  const syllables = readOptionalList(value, path, MAX_TRANSCRIBED_BEATS).map((syllable) =>
    typeof syllable === 'string' ? syllable.trim().replace(/\s+/g, '\u00A0').slice(0, MAX_TRANSCRIBED_SYLLABLE_LENGTH) : '',
  );
  return syllables.length === 0 ? undefined : syllables;
}

function parseTimeSignature(value: unknown, path: string): TranscribedMeasure['timeSignature'] {
  if (value === undefined || value === null) {
    return undefined;
  }
  const raw: RawObject = isRawObject(value) ? value : {};
  const { numerator, denominator } = raw;
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || !isTimeSignature({ numerator, denominator })) {
    throw new TranscriptionError(`${path}: expected a numerator 1–32 over a denominator 1, 2, 4, 8, 16 or 32`);
  }
  return { numerator, denominator };
}

function parseMeasure(value: unknown, path: string, trackCount: number | undefined): TranscribedMeasure {
  const measure = readObject(value, path);
  const parts = readOptionalList(measure.parts, `${path}.parts`, MAX_TRANSCRIBED_PARTS).map((part, index) => parsePart(part, `${path}.parts[${index}]`, trackCount));
  return withoutUndefined({
    timeSignature: parseTimeSignature(measure.timeSignature, `${path}.timeSignature`),
    tempo: parseTempo(measure.tempo),
    keySignature: toClampedInteger(measure.keySignature, -MAX_TRANSCRIBED_KEY_ACCIDENTALS, MAX_TRANSCRIBED_KEY_ACCIDENTALS),
    repeatOpen: toFlag(measure.repeatOpen),
    repeatClose: toPositive(toClampedInteger(measure.repeatClose, 0, MAX_TRANSCRIBED_REPEAT_PLAYS)),
    alternateEnding: toPositive(toClampedInteger(measure.alternateEnding, 0, MAX_TRANSCRIBED_ALTERNATE_ENDING)),
    parts,
    lyrics: parseLyrics(measure.lyrics, `${path}.lyrics`),
  });
}

function parseWarnings(value: unknown): readonly string[] {
  const warnings: readonly unknown[] = Array.isArray(value) ? value : [];
  return warnings.flatMap((warning) => toText(warning) ?? []);
}

/**
 * Checks a model's answer for one page (the input of its TRANSCRIPTION_TOOL call) field by field and returns it as a
 * TranscriptionPage. What is harmless is normalized: values clamped to the schema's ranges, unknown effects and tuplets,
 * blank text and fields of the wrong kind left out. What the song cannot be built without throws a TranscriptionError
 * naming the field ("measures[2].parts[0].beats[3].duration: …"): a page or measure that is not an object, lists that
 * are not lists, a beat without a known duration, a note with neither string and fret nor a readable pitch, a part for
 * a track the page does not list, an impossible time signature.
 */
export function parseTranscriptionPage(value: unknown): TranscriptionPage {
  const page = readObject(value, 'page');
  const tracks = parseTracks(page.tracks);
  const trackCount = tracks !== undefined && tracks.length > 0 ? tracks.length : undefined;
  const measures = readList(page.measures, 'measures', MAX_TRANSCRIBED_MEASURES).map((measure, index) => parseMeasure(measure, `measures[${index}]`, trackCount));
  const warnings = parseWarnings(page.warnings);
  return withoutUndefined({ song: parseSongInfo(page.song), tracks, measures, warnings: warnings.length === 0 ? undefined : warnings });
}
