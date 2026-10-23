/**
 * The tool a model is made to call with one page's transcription (Anthropic Messages API `tools` entry): its JSON
 * schema mirrors types.ts. The import forces the call (`tool_choice`), so the answer is always this structure.
 */

import { MAX_FRET } from '../edit/edit-song';
import { MAX_STRINGS } from '../write/gtp-song';
import { MAX_TUPLET_SIZE, TRANSCRIBED_DURATIONS } from './durations';
import { TRANSCRIBED_EFFECTS } from './note-effects';
import {
  MAX_TRANSCRIBED_ALTERNATE_ENDING,
  MAX_TRANSCRIBED_BEATS,
  MAX_TRANSCRIBED_CAPO,
  MAX_TRANSCRIBED_DOTS,
  MAX_TRANSCRIBED_KEY_ACCIDENTALS,
  MAX_TRANSCRIBED_MEASURES,
  MAX_TRANSCRIBED_NOTES,
  MAX_TRANSCRIBED_NUMERATOR,
  MAX_TRANSCRIBED_PARTS,
  MAX_TRANSCRIBED_REPEAT_PLAYS,
  MAX_TRANSCRIBED_SYLLABLE_LENGTH,
  MAX_TRANSCRIBED_TEMPO,
  MAX_TRANSCRIBED_TRACKS,
  MIN_TRANSCRIBED_TEMPO,
  TRANSCRIBED_DENOMINATORS,
  TRANSCRIBED_INSTRUMENTS,
} from './types';

const TEMPO_SCHEMA = { type: 'integer', minimum: MIN_TRANSCRIBED_TEMPO, maximum: MAX_TRANSCRIBED_TEMPO } as const;

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    string: { type: 'integer', minimum: 1, maximum: MAX_STRINGS, description: 'Tab string, 1 = highest (top tab line). With fret.' },
    fret: { type: 'integer', minimum: 0, maximum: MAX_FRET, description: 'Tab fret number. With string.' },
    pitch: { type: 'string', description: 'Written pitch on the staff when there is no tab, e.g. "C#4", "Bb3".' },
    tied: { type: 'boolean', description: 'True when tied from the previous note of the same pitch.' },
    effects: { type: 'array', items: { type: 'string', enum: TRANSCRIBED_EFFECTS } },
  },
  additionalProperties: false,
} as const;

const BEAT_SCHEMA = {
  type: 'object',
  properties: {
    duration: { type: 'string', enum: TRANSCRIBED_DURATIONS },
    dots: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_DOTS },
    tuplet: { type: 'integer', minimum: 0, maximum: MAX_TUPLET_SIZE, description: '3 for a triplet, 0 for none.' },
    rest: { type: 'boolean' },
    notes: { type: 'array', items: NOTE_SCHEMA, maxItems: MAX_TRANSCRIBED_NOTES, description: 'All notes struck together (a chord) on this beat.' },
  },
  required: ['duration'],
  additionalProperties: false,
} as const;

/** One measure: its parts, the marks printed at it, and the syllables sung in it. Shared with the song writer's tools. */
export const MEASURE_SCHEMA = {
  type: 'object',
  properties: {
    timeSignature: {
      type: 'object',
      properties: { numerator: { type: 'integer', minimum: 1, maximum: MAX_TRANSCRIBED_NUMERATOR }, denominator: { type: 'integer', enum: TRANSCRIBED_DENOMINATORS } },
      required: ['numerator', 'denominator'],
      additionalProperties: false,
    },
    tempo: TEMPO_SCHEMA,
    keySignature: { type: 'integer', minimum: -MAX_TRANSCRIBED_KEY_ACCIDENTALS, maximum: MAX_TRANSCRIBED_KEY_ACCIDENTALS },
    repeatOpen: { type: 'boolean' },
    repeatClose: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_REPEAT_PLAYS },
    alternateEnding: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_ALTERNATE_ENDING },
    parts: {
      type: 'array',
      maxItems: MAX_TRANSCRIBED_PARTS,
      items: {
        type: 'object',
        properties: {
          track: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_TRACKS - 1 },
          beats: { type: 'array', items: BEAT_SCHEMA, maxItems: MAX_TRANSCRIBED_BEATS },
        },
        required: ['track', 'beats'],
        additionalProperties: false,
      },
    },
    lyrics: {
      type: 'array',
      maxItems: MAX_TRANSCRIBED_BEATS,
      items: { type: 'string', maxLength: MAX_TRANSCRIBED_SYLLABLE_LENGTH },
      description: 'Syllables sung in this measure on the lyrics track, one per beat that has notes (rests take none), in order; "" for a note without one. Split a word over several notes: "Hel-", "lo".',
    },
  },
  required: ['parts'],
  additionalProperties: false,
} as const;

export const TRANSCRIPTION_TOOL = {
  name: 'record_transcription',
  description: 'Record the transcription of one page of guitar or bass sheet music, every measure in order.',
  input_schema: {
    type: 'object',
    properties: {
      song: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          artist: { type: 'string' },
          tempo: TEMPO_SCHEMA,
          lyricsTrack: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_TRACKS - 1, description: 'The track the lyrics are sung on.' },
        },
        additionalProperties: false,
      },
      tracks: {
        type: 'array',
        maxItems: MAX_TRANSCRIBED_TRACKS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            instrument: { type: 'string', enum: TRANSCRIBED_INSTRUMENTS },
            tuning: { type: 'array', items: { type: 'string' }, description: 'Open strings, lowest first, e.g. ["E2","A2","D3","G3","B3","E4"].' },
            capo: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_CAPO },
          },
          required: ['name', 'instrument', 'tuning', 'capo'],
          additionalProperties: false,
        },
      },
      measures: { type: 'array', items: MEASURE_SCHEMA, maxItems: MAX_TRANSCRIBED_MEASURES },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['measures'],
    additionalProperties: false,
  },
} as const;
