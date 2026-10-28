import { describe, expect, it } from 'vitest';
import { MAX_FRET } from '../src/edit/edit-song';
import { TRANSCRIBED_DURATIONS } from '../src/transcription/durations';
import { TRANSCRIBED_EFFECTS } from '../src/transcription/note-effects';
import { parseTranscriptionPage } from '../src/transcription/parse-page';
import { TRANSCRIPTION_TOOL } from '../src/transcription/tool';
import { PLAN_SONG_TOOL, WRITE_SECTION_TOOL } from '../src/composition/tool';
import { COMPOSED_INSTRUMENTS } from '../src/composition/types';
import { GM_PERCUSSION_NAMES } from '../src/formats/common/channels';
import { MEASURE_SCHEMA } from '../src/transcription/tool';
import { TRANSCRIBED_CLEFS, TRANSCRIBED_INSTRUMENTS } from '../src/transcription/types';
import { MAX_STRINGS } from '../src/write/gtp-song';

const schema = TRANSCRIPTION_TOOL.input_schema.properties;
const measureSchema = schema.measures.items.properties;
const beatSchema = measureSchema.parts.items.properties.beats.items.properties;
const noteSchema = beatSchema.notes.items.properties;
const trackSchema = schema.tracks.items;

function parsedMeasure(measure: Record<string, unknown>) {
  return parseTranscriptionPage({ measures: [{ ...measure, parts: [] }] }).measures[0];
}

describe('TRANSCRIPTION_TOOL: the schema states what the parser accepts', () => {
  it('lists the durations, effects and instruments the parser knows', () => {
    expect(beatSchema.duration.enum).toEqual(TRANSCRIBED_DURATIONS);
    expect(noteSchema.effects.items.enum).toEqual(TRANSCRIBED_EFFECTS);
    expect(schema.tracks.items.properties.instrument.enum).toEqual(TRANSCRIBED_INSTRUMENTS);
  });

  it('takes every kind of staff: the instruments, a drum by its General MIDI name, a clef and a program', () => {
    expect(TRANSCRIBED_INSTRUMENTS).toEqual(['guitar', 'bass', 'ukulele', 'banjo', 'drums', 'vocals', 'keys', 'other']);
    expect(noteSchema.drum.enum).toEqual(GM_PERCUSSION_NAMES);
    expect(trackSchema.properties.clef.enum).toEqual(TRANSCRIBED_CLEFS);
    expect(trackSchema.properties.program).toMatchObject({ minimum: 0, maximum: 127 });
    expect(trackSchema.required).toEqual(['name', 'instrument']);
  });

  it('leaves the song writer’s tools as they were: guitar and bass tracks, notes without drums', () => {
    expect(PLAN_SONG_TOOL.input_schema.properties.tracks.items.properties.instrument.enum).toEqual(COMPOSED_INSTRUMENTS);
    expect(COMPOSED_INSTRUMENTS).toEqual(['guitar', 'bass']);
    expect(WRITE_SECTION_TOOL.input_schema.properties.measures.items).toBe(MEASURE_SCHEMA);
    expect(JSON.stringify(WRITE_SECTION_TOOL)).not.toContain('drum');
    expect(JSON.stringify(PLAN_SONG_TOOL)).not.toContain('drum');
  });

  it('allows the strings and frets a song can hold', () => {
    expect(noteSchema.string.maximum).toBe(MAX_STRINGS);
    expect(noteSchema.fret.maximum).toBe(MAX_FRET);
  });

  it('has the tempo range the parser clamps to', () => {
    // Arrange
    const { minimum, maximum } = measureSchema.tempo;

    // Act
    const atMaximum = parsedMeasure({ tempo: maximum });
    const above = parsedMeasure({ tempo: maximum + 1 });
    const atMinimum = parsedMeasure({ tempo: minimum });

    // Assert
    expect(atMaximum?.tempo).toBe(maximum);
    expect(above?.tempo).toBe(maximum);
    expect(atMinimum?.tempo).toBe(minimum);
  });

  it('has the time signature denominators the parser accepts', () => {
    const { enum: denominators } = measureSchema.timeSignature.properties.denominator;
    for (const denominator of denominators) {
      expect(parsedMeasure({ timeSignature: { numerator: 4, denominator } })?.timeSignature).toEqual({ numerator: 4, denominator });
    }
    expect(() => parsedMeasure({ timeSignature: { numerator: 4, denominator: 3 } })).toThrow(/denominator/);
  });
});
