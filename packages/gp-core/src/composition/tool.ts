/**
 * The song writer's tools (Anthropic Messages API `tools` entries): plan_song for the plan (types.ts), then
 * write_section once per section, with the transcription contract's measures.
 */

import { MEASURE_SCHEMA } from '../transcription/tool';
import { MAX_TRANSCRIBED_CAPO, MAX_TRANSCRIBED_KEY_ACCIDENTALS, MAX_TRANSCRIBED_NUMERATOR, TRANSCRIBED_DENOMINATORS, TRANSCRIBED_INSTRUMENTS } from '../transcription/types';
import { MAX_PLAN_SECTIONS, MAX_PLAN_TEMPO, MAX_PLAN_TRACKS, MAX_SECTION_BARS, MIN_PLAN_TEMPO } from './types';

export const PLAN_SONG_TOOL = {
  name: 'plan_song',
  description: 'Plan a new song: its tempo, meter, key, instruments and its sections in order, with chords and lyrics.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      tempo: { type: 'integer', minimum: MIN_PLAN_TEMPO, maximum: MAX_PLAN_TEMPO, description: 'Quarter-note BPM.' },
      timeSignature: {
        type: 'object',
        properties: { numerator: { type: 'integer', minimum: 1, maximum: MAX_TRANSCRIBED_NUMERATOR }, denominator: { type: 'integer', enum: TRANSCRIBED_DENOMINATORS } },
        required: ['numerator', 'denominator'],
        additionalProperties: false,
      },
      keySignature: { type: 'integer', minimum: -MAX_TRANSCRIBED_KEY_ACCIDENTALS, maximum: MAX_TRANSCRIBED_KEY_ACCIDENTALS, description: 'Sharps (> 0) or flats (< 0).' },
      tracks: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PLAN_TRACKS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g. "Lead guitar (melody)", "Rhythm guitar", "Bass".' },
            instrument: { type: 'string', enum: TRANSCRIBED_INSTRUMENTS },
            tuning: { type: 'array', items: { type: 'string' }, description: 'Open strings, lowest first, e.g. ["E2","A2","D3","G3","B3","E4"].' },
            capo: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_CAPO },
          },
          required: ['name', 'instrument', 'tuning', 'capo'],
          additionalProperties: false,
        },
      },
      lyricsTrack: { type: 'integer', minimum: 0, maximum: MAX_PLAN_TRACKS - 1, description: 'Index of the track that plays the sung melody.' },
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PLAN_SECTIONS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g. "Intro", "Verse 1", "Chorus", "Solo", "Outro".' },
            bars: { type: 'integer', minimum: 1, maximum: MAX_SECTION_BARS },
            chords: { type: 'string', description: 'The progression, one chord per bar or half bar, e.g. "Dm | Bb | F | C".' },
            lyrics: { type: 'string', description: 'The lines sung in this section; "" when instrumental.' },
            idea: { type: 'string', description: 'Feel, dynamics, rhythm and which instrument leads.' },
          },
          required: ['name', 'bars', 'chords', 'lyrics', 'idea'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'tempo', 'timeSignature', 'keySignature', 'tracks', 'lyricsTrack', 'sections'],
    additionalProperties: false,
  },
} as const;

export const WRITE_SECTION_TOOL = {
  name: 'write_section',
  description: 'Write every measure of one section of the planned song, all tracks, with the syllables sung on the lyrics track.',
  input_schema: {
    type: 'object',
    properties: {
      measures: { type: 'array', items: MEASURE_SCHEMA, maxItems: MAX_SECTION_BARS },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['measures'],
    additionalProperties: false,
  },
} as const;
