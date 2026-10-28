import { CompositionError, TranscriptionError } from '../errors';
import { FOUR_FOUR } from '../model/defaults';
import type { TimeSignature } from '../model/song';
import { isTimeSignature } from '../transcription/durations';
import { parseTrack } from '../transcription/parse-page';
import { type RawObject, isRawObject, toClampedInteger } from '../transcription/parse-values';
import { MAX_TRANSCRIBED_KEY_ACCIDENTALS, type TranscribedTrack } from '../transcription/types';
import {
  DEFAULT_PLAN_TEMPO,
  MAX_PLAN_BARS,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_SECTIONS,
  MAX_PLAN_TEMPO,
  MAX_PLAN_TEXT_LENGTH,
  MAX_PLAN_TRACKS,
  MAX_SECTION_BARS,
  MIN_PLAN_TEMPO,
  type PlannedSection,
  type SongPlan,
} from './types';


/** Trimmed text cut to `max` characters; "" for anything but text. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** A list of 1…max items; throws a CompositionError naming the field otherwise. */
function readItems(value: unknown, field: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CompositionError(`${field}: expected a list of 1 to ${max}`);
  }
  if (value.length > max) {
    throw new CompositionError(`${field}: ${value.length} given (at most ${max})`);
  }
  return value;
}

function parseTimeSignature(value: unknown): TimeSignature {
  const raw: RawObject = isRawObject(value) ? value : {};
  const { numerator, denominator } = raw;
  return typeof numerator === 'number' && typeof denominator === 'number' && isTimeSignature({ numerator, denominator }) ? { numerator, denominator } : FOUR_FOUR;
}

/** The song writer writes tab for guitars and basses only: any other instrument is a guitar, with no program or clef. */
function toComposedTrack({ name, instrument, tuning, capo }: TranscribedTrack): TranscribedTrack {
  return { name, instrument: instrument === 'bass' ? 'bass' : 'guitar', tuning, capo };
}

function parseTracks(value: unknown): readonly TranscribedTrack[] {
  return readItems(value, 'tracks', MAX_PLAN_TRACKS).map((track, index) => {
    try {
      return toComposedTrack(parseTrack(track, `tracks[${index}]`));
    } catch (error: unknown) {
      throw error instanceof TranscriptionError ? new CompositionError(error.message) : error;
    }
  });
}

function parseSection(value: unknown, index: number): PlannedSection {
  const raw: RawObject = isRawObject(value) ? value : {};
  return {
    name: text(raw.name, MAX_PLAN_NAME_LENGTH) || `Section ${index + 1}`,
    bars: toClampedInteger(raw.bars, 1, MAX_SECTION_BARS) ?? 1,
    chords: text(raw.chords, MAX_PLAN_TEXT_LENGTH),
    lyrics: text(raw.lyrics, MAX_PLAN_TEXT_LENGTH),
    idea: text(raw.idea, MAX_PLAN_TEXT_LENGTH),
  };
}

interface FittedSections {
  readonly sections: readonly PlannedSection[];
  readonly warnings: readonly string[];
}

/** The sections, in order, that fit in MAX_PLAN_BARS; a warning names those left out. */
function fitToBarBudget(sections: readonly PlannedSection[]): FittedSections {
  const ends = sections.map((_, index) => sections.slice(0, index + 1).reduce((bars, section) => bars + section.bars, 0));
  const kept = sections.filter((_, index) => (ends[index] ?? 0) <= MAX_PLAN_BARS);
  const left = sections.slice(kept.length);
  const first = left[0];
  const last = left.at(-1);
  if (first === undefined || last === undefined) {
    return { sections, warnings: [] };
  }
  const which = first === last ? `${first.name} was` : `${first.name} to ${last.name} were`;
  return { sections: kept, warnings: [`The plan had ${ends.at(-1) ?? 0} bars; ${which} left out to keep it to ${MAX_PLAN_BARS}`] };
}

/**
 * Checks a model's plan (the input of its PLAN_SONG_TOOL call). Out-of-range numbers are clamped, an unusable meter is
 * 4/4, a nameless section is "Section n", and sections past MAX_PLAN_BARS are left out with a warning. Throws a
 * CompositionError when there is nothing to write: no object, no tracks or no sections (or more than allowed).
 */
export function parseSongPlan(value: unknown): SongPlan {
  if (!isRawObject(value)) {
    throw new CompositionError('plan: expected an object');
  }
  const tracks = parseTracks(value.tracks);
  const fitted = fitToBarBudget(readItems(value.sections, 'sections', MAX_PLAN_SECTIONS).map(parseSection));
  return {
    title: text(value.title, MAX_PLAN_NAME_LENGTH),
    tempo: toClampedInteger(value.tempo, MIN_PLAN_TEMPO, MAX_PLAN_TEMPO) ?? DEFAULT_PLAN_TEMPO,
    timeSignature: parseTimeSignature(value.timeSignature),
    keySignature: toClampedInteger(value.keySignature, -MAX_TRANSCRIBED_KEY_ACCIDENTALS, MAX_TRANSCRIBED_KEY_ACCIDENTALS) ?? 0,
    tracks,
    lyricsTrack: toClampedInteger(value.lyricsTrack, 0, tracks.length - 1) ?? 0,
    sections: fitted.sections,
    warnings: fitted.warnings,
  };
}
