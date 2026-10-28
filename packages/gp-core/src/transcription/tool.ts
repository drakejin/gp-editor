/**
 * The tool a model is asked to call with one page's transcription (Anthropic Messages API `tools` entry): its JSON
 * schema mirrors types.ts. The call is asked for in the prompt, not forced (`tool_choice` "tool" is refused by Claude
 * Opus 5.5), and parse-page.ts checks every answer against the contract.
 */

import { MAX_FRET } from '../edit/edit-song';
import { GM_PERCUSSION_NAMES } from '../formats/common/channels';
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
  MAX_TRANSCRIBED_PROGRAM,
  MAX_TRANSCRIBED_REPEAT_PLAYS,
  MAX_TRANSCRIBED_SYLLABLE_LENGTH,
  MAX_TRANSCRIBED_TEMPO,
  MAX_TRANSCRIBED_TRACKS,
  MIN_TRANSCRIBED_TEMPO,
  TRANSCRIBED_CLEFS,
  TRANSCRIBED_DENOMINATORS,
  TRANSCRIBED_INSTRUMENTS,
} from './types';

const TEMPO_SCHEMA = { type: 'integer', minimum: MIN_TRANSCRIBED_TEMPO, maximum: MAX_TRANSCRIBED_TEMPO } as const;

const NOTE_PROPERTIES = {
  string: { type: 'integer', minimum: 1, maximum: MAX_STRINGS, description: 'Tab string, 1 = highest (top tab line). With fret.' },
  fret: { type: 'integer', minimum: 0, maximum: MAX_FRET, description: 'Tab fret number. With string.' },
  pitch: { type: 'string', description: 'Written pitch on the staff when there is no tab, e.g. "C#4", "Bb3".' },
  tied: { type: 'boolean', description: 'True when tied from the previous note of the same pitch.' },
  effects: { type: 'array', items: { type: 'string', enum: TRANSCRIBED_EFFECTS } },
} as const;

/** A note of a tab or pitched staff: the song writer's notes. */
const NOTE_SCHEMA = { type: 'object', properties: NOTE_PROPERTIES, additionalProperties: false } as const;

/** A note of any staff a page holds: a drum staff's notes name their drum. */
const PAGE_NOTE_SCHEMA = {
  type: 'object',
  properties: {
    ...NOTE_PROPERTIES,
    drum: { type: 'string', enum: GM_PERCUSSION_NAMES, description: 'On a drum staff instead of a pitch: the drum played, by its General MIDI percussion name.' },
  },
  additionalProperties: false,
} as const;

function beatSchemaOf<Note>(note: Note) {
  return {
    type: 'object',
    properties: {
      duration: { type: 'string', enum: TRANSCRIBED_DURATIONS },
      dots: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_DOTS },
      tuplet: { type: 'integer', minimum: 0, maximum: MAX_TUPLET_SIZE, description: '3 for a triplet, 0 for none.' },
      rest: { type: 'boolean' },
      notes: { type: 'array', items: note, maxItems: MAX_TRANSCRIBED_NOTES, description: 'All notes struck together (a chord) on this beat.' },
    },
    required: ['duration'],
    additionalProperties: false,
  } as const;
}

/** One measure, its notes as `note` describes them: its parts, the marks printed at it, and the syllables sung in it. */
function measureSchemaOf<Note>(note: Note) {
  return {
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
            beats: { type: 'array', items: beatSchemaOf(note), maxItems: MAX_TRANSCRIBED_BEATS },
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
}

/** One measure of tab and pitched notes. Shared with the song writer's tools. */
export const MEASURE_SCHEMA = measureSchemaOf(NOTE_SCHEMA);

export const TRANSCRIPTION_TOOL = {
  name: 'record_transcription',
  description: 'Record the transcription of one page of sheet music: every staff (guitars, bass, drums, vocals, keyboards and any other instrument), every measure in order.',
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
            tuning: { type: 'array', items: { type: 'string' }, description: 'Guitar, bass, ukulele or banjo only: open strings, lowest first, e.g. ["E2","A2","D3","G3","B3","E4"].' },
            capo: { type: 'integer', minimum: 0, maximum: MAX_TRANSCRIBED_CAPO, description: 'Guitar, bass, ukulele or banjo only.' },
            program: {
              type: 'integer',
              minimum: 0,
              maximum: MAX_TRANSCRIBED_PROGRAM,
              description: 'General MIDI program (0-based) of a vocals, keys or other track, e.g. 0 piano, 4 electric piano, 16 organ, 40 violin, 42 cello, 48 strings, 53 voice, 56 trumpet, 65 alto sax, 73 flute, 81 saw lead.',
            },
            clef: { type: 'string', enum: TRANSCRIBED_CLEFS, description: 'The clef of a vocals, keys or other staff.' },
          },
          required: ['name', 'instrument'],
          additionalProperties: false,
        },
      },
      measures: { type: 'array', items: measureSchemaOf(PAGE_NOTE_SCHEMA), maxItems: MAX_TRANSCRIBED_MEASURES },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['measures'],
    additionalProperties: false,
  },
} as const;
