/**
 * The tool a model is made to call with one page's transcription (Anthropic Messages API `tools` entry): its JSON
 * schema mirrors types.ts. The import forces the call (`tool_choice`), so the answer is always this structure.
 */

import {
  MAX_TRANSCRIBED_BEATS,
  MAX_TRANSCRIBED_MEASURES,
  MAX_TRANSCRIBED_NOTES,
  MAX_TRANSCRIBED_PARTS,
  MAX_TRANSCRIBED_TRACKS,
} from './types';

const DURATIONS = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'] as const;
const EFFECTS = ['hammer', 'slide', 'bend', 'vibrato', 'palmMute', 'letRing', 'deadNote', 'ghostNote', 'accent', 'harmonic'] as const;

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    string: { type: 'integer', minimum: 1, maximum: 7, description: 'Tab string, 1 = highest (top tab line). With fret.' },
    fret: { type: 'integer', minimum: 0, maximum: 29, description: 'Tab fret number. With string.' },
    pitch: { type: 'string', description: 'Written pitch on the staff when there is no tab, e.g. "C#4", "Bb3".' },
    tied: { type: 'boolean', description: 'True when tied from the previous note of the same pitch.' },
    effects: { type: 'array', items: { type: 'string', enum: EFFECTS } },
  },
  additionalProperties: false,
} as const;

const BEAT_SCHEMA = {
  type: 'object',
  properties: {
    duration: { type: 'string', enum: DURATIONS },
    dots: { type: 'integer', minimum: 0, maximum: 2 },
    tuplet: { type: 'integer', minimum: 0, maximum: 12, description: '3 for a triplet, 0 for none.' },
    rest: { type: 'boolean' },
    notes: { type: 'array', items: NOTE_SCHEMA, maxItems: MAX_TRANSCRIBED_NOTES, description: 'All notes struck together (a chord) on this beat.' },
  },
  required: ['duration'],
  additionalProperties: false,
} as const;

const MEASURE_SCHEMA = {
  type: 'object',
  properties: {
    timeSignature: {
      type: 'object',
      properties: { numerator: { type: 'integer', minimum: 1, maximum: 32 }, denominator: { type: 'integer', enum: [1, 2, 4, 8, 16, 32] } },
      required: ['numerator', 'denominator'],
      additionalProperties: false,
    },
    tempo: { type: 'integer', minimum: 10, maximum: 400 },
    keySignature: { type: 'integer', minimum: -7, maximum: 7 },
    repeatOpen: { type: 'boolean' },
    repeatClose: { type: 'integer', minimum: 0, maximum: 16 },
    alternateEnding: { type: 'integer', minimum: 0, maximum: 8 },
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
        properties: { title: { type: 'string' }, artist: { type: 'string' }, tempo: { type: 'integer', minimum: 10, maximum: 400 } },
        additionalProperties: false,
      },
      tracks: {
        type: 'array',
        maxItems: MAX_TRANSCRIBED_TRACKS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            instrument: { type: 'string', enum: ['guitar', 'bass'] },
            tuning: { type: 'array', items: { type: 'string' }, description: 'Open strings, lowest first, e.g. ["E2","A2","D3","G3","B3","E4"].' },
            capo: { type: 'integer', minimum: 0, maximum: 24 },
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
