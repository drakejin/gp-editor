/**
 * Compose from Here's tool (an Anthropic Messages API `tools` entry): the bars from the start bar on, each with the PDF
 * import's parts (any staff: tab, pitches or drums by name), the tracks to add — described as the PDF import's tracks —
 * and warnings. Asked for in the prompt, not forced (Claude Opus 5.5 refuses a forced tool_choice); parse-bars.ts checks
 * every answer.
 */

import { MEASURE_CHANGE_PROPERTIES, PAGE_PARTS_SCHEMA, TRANSCRIBED_TRACK_SCHEMA } from '../transcription/tool';
import { MAX_COMPOSED_BARS, MAX_COMPOSED_NEW_TRACKS } from './compose-types';

/** One bar: a meter, tempo or key only where it changes in a bar added past the song's end, and a part per written track. */
const BAR_SCHEMA = {
  type: 'object',
  properties: { ...MEASURE_CHANGE_PROPERTIES, parts: PAGE_PARTS_SCHEMA },
  required: ['parts'],
  additionalProperties: false,
} as const;

export const WRITE_BARS_TOOL = {
  name: 'write_bars',
  description:
    'Write the bars from the start bar on, in order: in each bar one part per track you write (two for two voices), its beats filling the bar. List any new tracks first; the first new track takes the index after the score’s last track.',
  input_schema: {
    type: 'object',
    properties: {
      newTracks: { type: 'array', maxItems: MAX_COMPOSED_NEW_TRACKS, items: TRANSCRIBED_TRACK_SCHEMA, description: 'Tracks to add, only when the request allows it.' },
      bars: { type: 'array', minItems: 1, maxItems: MAX_COMPOSED_BARS, items: BAR_SCHEMA },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Anything the user should know: what you could not do as asked.' },
    },
    required: ['bars'],
    additionalProperties: false,
  },
} as const;
