import { describe, expect, it } from 'vitest';
import { TranscriptionError } from '../src/errors';
import { parseTranscriptionPage } from '../src/transcription/parse-page';
import {
  MAX_TRANSCRIBED_BEATS,
  MAX_TRANSCRIBED_MEASURES,
  MAX_TRANSCRIBED_NAME_LENGTH,
  MAX_TRANSCRIBED_TUNING_STRINGS,
  MAX_TRANSCRIBED_NOTES,
  MAX_TRANSCRIBED_PARTS,
  MAX_TRANSCRIBED_TRACKS,
} from '../src/transcription/types';
import { TRANSCRIPTION_TOOL } from '../src/transcription/tool';
import { BASS, DRUMS, GUITAR, PIANO_LEFT, PIANO_RIGHT, VOCALS, bar, drum, page, play, rest, run, tab, written } from './helpers/transcription-pages';

/** A measure as raw JSON, with one part for track 0. */
function rawBar(beats: readonly unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extra, parts: [{ track: 0, beats }] };
}

function parseBeat(beat: unknown) {
  return parseTranscriptionPage({ measures: [rawBar([beat])] }).measures[0]?.parts[0]?.beats[0];
}

function parseNote(note: unknown) {
  return parseBeat({ duration: 'quarter', notes: [note] })?.notes?.[0];
}

function errorOf(value: unknown): TranscriptionError {
  try {
    parseTranscriptionPage(value);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a TranscriptionError');
}

describe('parseTranscriptionPage: well-formed pages', () => {
  it('returns a tab page as it was given', () => {
    // Arrange
    const value = page([bar(run('eighth', 8)), bar([play('whole', tab(3, 0), tab(2, 1), tab(1, 0))], { timeSignature: { numerator: 4, denominator: 4 } })], {
      song: { title: 'Song', artist: 'Band', tempo: 96 },
      tracks: [GUITAR, BASS],
      warnings: ['Bar 3 is smudged'],
    });

    // Act
    const parsed = parseTranscriptionPage(JSON.parse(JSON.stringify(value)));

    // Assert
    expect(parsed).toEqual(value);
  });

  it('keeps every measure field, beat field and note field the contract has', () => {
    // Arrange
    const measure = {
      timeSignature: { numerator: 6, denominator: 8 },
      tempo: 140,
      keySignature: -3,
      repeatOpen: true,
      repeatClose: 2,
      alternateEnding: 1,
      parts: [{ track: 0, beats: [{ duration: 'eighth', dots: 1, tuplet: 3, notes: [{ pitch: 'C#4', tied: true, effects: ['vibrato', 'bend'] }] }] }],
    };

    // Act
    const parsed = parseTranscriptionPage({ measures: [measure] });

    // Assert
    expect(parsed).toEqual({ measures: [measure] });
  });

  it('accepts a page without tracks, song or warnings, and parts for any track index', () => {
    // Act
    const parsed = parseTranscriptionPage({ measures: [{ parts: [{ track: 5, beats: [rest('whole')] }] }] });

    // Assert
    expect(parsed).toEqual({ measures: [{ parts: [{ track: 5, beats: [{ duration: 'whole', rest: true }] }] }] });
  });

  it('refuses a track index beyond any score, so a wild answer cannot make the builder allocate millions of tracks', () => {
    // Arrange
    const page = { measures: [{ parts: [{ track: 100_000_000, beats: [rest('whole')] }] }] };

    // Act + Assert
    expect(() => parseTranscriptionPage(page)).toThrow(TranscriptionError);
    expect(() => parseTranscriptionPage(page)).toThrow(`at most ${MAX_TRANSCRIBED_TRACKS} tracks`);
    expect(parseTranscriptionPage({ measures: [{ parts: [{ track: MAX_TRANSCRIBED_TRACKS - 1, beats: [rest('whole')] }] }] }).measures).toHaveLength(1);
    const tooMany = Array.from({ length: MAX_TRANSCRIBED_TRACKS + 1 }, (_, i) => ({ name: `T${i}`, instrument: 'guitar', tuning: [], capo: 0 }));
    expect(() => parseTranscriptionPage({ tracks: tooMany, measures: [] })).toThrow(`at most ${MAX_TRANSCRIBED_TRACKS} tracks`);
  });

  it('refuses lists longer than any page holds: measures, parts, beats and notes', () => {
    // Arrange
    const quarter = { duration: 'quarter', notes: [{ string: 1, fret: 0 }] };
    const measures = (count: number) => Array.from({ length: count }, () => ({ parts: [] }));
    const part = (beats: number) => ({ track: 0, beats: Array.from({ length: beats }, () => quarter) });
    const chord = (notes: number) => ({ duration: 'quarter', notes: Array.from({ length: notes }, (_, i) => ({ string: 1 + (i % 6), fret: i })) });

    // Act + Assert
    expect(() => parseTranscriptionPage({ measures: measures(MAX_TRANSCRIBED_MEASURES + 1) })).toThrow(`at most ${MAX_TRANSCRIBED_MEASURES}`);
    expect(() => parseTranscriptionPage({ measures: [{ parts: Array.from({ length: MAX_TRANSCRIBED_PARTS + 1 }, () => part(1)) }] })).toThrow(`at most ${MAX_TRANSCRIBED_PARTS}`);
    expect(() => parseTranscriptionPage({ measures: [{ parts: [part(MAX_TRANSCRIBED_BEATS + 1)] }] })).toThrow(`at most ${MAX_TRANSCRIBED_BEATS}`);
    expect(() => parseTranscriptionPage({ measures: [{ parts: [{ track: 0, beats: [chord(MAX_TRANSCRIBED_NOTES + 1)] }] }] })).toThrow(TranscriptionError);
    expect(parseTranscriptionPage({ measures: measures(MAX_TRANSCRIBED_MEASURES) }).measures).toHaveLength(MAX_TRANSCRIBED_MEASURES);
  });

  it('accepts every duration and effect the tool schema offers', () => {
    // Arrange
    const schema = TRANSCRIPTION_TOOL.input_schema.properties.measures.items.properties.parts.items.properties.beats.items;
    const durations = schema.properties.duration.enum;
    const effects = schema.properties.notes.items.properties.effects.items.enum;
    const beats = durations.map((duration) => ({ duration, notes: [{ string: 1, fret: 0, effects: [...effects] }] }));

    // Act
    const parsed = parseTranscriptionPage({ measures: [rawBar(beats)] });

    // Assert
    expect(parsed.measures[0]?.parts[0]?.beats.map((beat) => beat.duration)).toEqual(durations);
    expect(parsed.measures[0]?.parts[0]?.beats[0]?.notes?.[0]?.effects).toEqual(effects);
  });

  it('builds new objects instead of returning the input', () => {
    // Arrange
    const value = page([bar([play('whole', written('E4'))])]);

    // Act
    const parsed = parseTranscriptionPage(value);

    // Assert
    expect(parsed).not.toBe(value);
    expect(parsed.measures[0]).not.toBe(value.measures[0]);
  });
});

describe('parseTranscriptionPage: harmless values are normalized', () => {
  it('clamps dots to 0–2 and drops a tuplet it does not know', () => {
    // Act
    const beats = [
      parseBeat({ duration: 'quarter', dots: 5 }),
      parseBeat({ duration: 'quarter', dots: -1, tuplet: 1 }),
      parseBeat({ duration: 'quarter', dots: 'one', tuplet: 13 }),
      parseBeat({ duration: 'quarter', tuplet: 0 }),
      parseBeat({ duration: 'quarter', tuplet: 'x' }),
    ];

    // Assert
    expect(beats).toEqual([
      { duration: 'quarter', dots: 2 },
      { duration: 'quarter' },
      { duration: 'quarter' },
      { duration: 'quarter' },
      { duration: 'quarter' },
    ]);
  });

  it('drops the notes of a beat marked as a rest', () => {
    // Act
    const beat = parseBeat({ duration: 'half', rest: true, notes: [{ string: 1, fret: 3 }, { nonsense: true }] });

    // Assert
    expect(beat).toEqual({ duration: 'half', rest: true });
  });

  it('ignores unknown and repeated effects and a non-list of effects', () => {
    // Act
    const notes = [
      parseNote({ string: 2, fret: 3, effects: ['vibrato', 'wah', 'vibrato', 7, 'accent'] }),
      parseNote({ string: 2, fret: 3, effects: 'vibrato' }),
      parseNote({ string: 2, fret: 3, effects: ['constructor'] }),
    ];

    // Assert
    expect(notes).toEqual([{ string: 2, fret: 3, effects: ['vibrato', 'accent'] }, { string: 2, fret: 3 }, { string: 2, fret: 3 }]);
  });

  it('rounds and clamps a tab string and fret, and keeps only a pitch it can read', () => {
    // Act
    const notes = [
      parseNote({ string: 0, fret: 35 }),
      parseNote({ string: 2.4, fret: -3 }),
      parseNote({ string: 9, fret: 5 }),
      parseNote({ string: 1, fret: 0, pitch: 'nonsense' }),
      parseNote({ string: 1, fret: 0, pitch: 'E4', tied: 'yes' }),
      parseNote({ string: 1, pitch: ' F#4 ', tied: true }),
    ];

    // Assert
    expect(notes).toEqual([
      { string: 1, fret: 29 },
      { string: 2, fret: 0 },
      { string: 7, fret: 5 },
      { string: 1, fret: 0 },
      { string: 1, fret: 0, pitch: 'E4' },
      { pitch: 'F#4', tied: true },
    ]);
  });

  it('clamps tempo, key, repeat and ending numbers to their ranges and drops values of the wrong kind', () => {
    // Act
    const parsed = parseTranscriptionPage({
      measures: [
        { tempo: 500, keySignature: 9, repeatClose: 40, alternateEnding: 12, repeatOpen: 'yes', parts: [] },
        { tempo: 5, keySignature: -8.4, repeatClose: -1, alternateEnding: 0, repeatOpen: false, parts: [] },
        { tempo: 'fast', keySignature: null, repeatClose: '2', alternateEnding: true, parts: [] },
        { tempo: -20, parts: [] },
      ],
    });

    // Assert
    expect(parsed.measures).toEqual([
      { tempo: 400, keySignature: 7, repeatClose: 16, alternateEnding: 8, parts: [] },
      { tempo: 10, keySignature: -7, parts: [] },
      { parts: [] },
      { parts: [] },
    ]);
  });

  it('reads a measure without parts as one with no parts', () => {
    // Act
    const parsed = parseTranscriptionPage({ measures: [{}, { parts: null }] });

    // Assert
    expect(parsed.measures).toEqual([{ parts: [] }, { parts: [] }]);
  });

  it('drops empty song fields and blank warnings, and trims text', () => {
    // Act
    const parsed = parseTranscriptionPage({
      song: { title: '  ', artist: ' Band ', tempo: 'slow' },
      measures: [],
      warnings: [' Bar 2 is cut off ', '', 3, '   '],
    });

    // Assert
    expect(parsed).toEqual({ song: { artist: 'Band' }, measures: [], warnings: ['Bar 2 is cut off'] });
  });

  it('drops song info that is not an object, an empty song and warnings that are not a list', () => {
    // Act
    const parsed = [
      parseTranscriptionPage({ song: 'My Song', measures: [], warnings: 'none' }),
      parseTranscriptionPage({ song: { title: '' }, measures: [] }),
    ];

    // Assert
    expect(parsed).toEqual([{ measures: [] }, { measures: [] }]);
  });

  it('reads a track with missing or odd fields as a guitar without capo', () => {
    // Act
    const parsed = parseTranscriptionPage({
      tracks: [
        { name: 7, instrument: 'kazoo', tuning: 'standard', capo: 'none' },
        { name: ' Bass ', instrument: 'bass', tuning: ['E1', 33, ' D2 '], capo: 30 },
        { name: 'Capo', instrument: 'guitar', tuning: [], capo: 2.6 },
      ],
      measures: [],
    });

    // Assert
    expect(parsed.tracks).toEqual([
      { name: '', instrument: 'other', tuning: [], capo: 0 },
      { name: 'Bass', instrument: 'bass', tuning: ['E1', '33', 'D2'], capo: 24 },
      { name: 'Capo', instrument: 'guitar', tuning: [], capo: 3 },
    ]);
  });
});

describe('parseTranscriptionPage: structural problems throw a TranscriptionError', () => {
  it.each([null, undefined, 'page', 42, [{ measures: [] }]])('rejects %j as a page', (value) => {
    // Act
    const error = errorOf(value);

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TranscriptionError');
    expect(error.message).toMatch(/page/);
  });

  it.each([
    ['measures are missing', {}, 'measures: expected a list'],
    ['measures are not a list', { measures: { 0: {} } }, 'measures: expected a list'],
    ['a measure is not an object', { measures: [rawBar([]), 'bar 2'] }, 'measures[1]: expected an object'],
    ['parts are not a list', { measures: [{ parts: {} }] }, 'measures[0].parts: expected a list'],
    ['a part is not an object', { measures: [{ parts: [3] }] }, 'measures[0].parts[0]: expected an object'],
    ['beats are not a list', { measures: [{ parts: [{ track: 0 }] }] }, 'measures[0].parts[0].beats: expected a list'],
    ['a beat is not an object', { measures: [rawBar(['quarter'])] }, 'measures[0].parts[0].beats[0]: expected an object'],
    ['notes are not a list', { measures: [rawBar([{ duration: 'half', notes: 'C4' }])] }, 'measures[0].parts[0].beats[0].notes: expected a list'],
    ['tracks are not a list', { tracks: GUITAR, measures: [] }, 'tracks: expected a list'],
    ['a track is not an object', { tracks: [GUITAR, 'Bass'], measures: [] }, 'tracks[1]: expected an object'],
  ])('rejects a page whose %s', (_case, value, message) => {
    // Act
    const error = errorOf(value);

    // Assert
    expect(error.message).toBe(message);
  });

  it.each([undefined, 'sixteenth', 16, 'Quarter'])('rejects a beat whose duration is %j', (duration) => {
    // Act
    const error = errorOf({ measures: [rawBar([{ duration: 'quarter' }, { duration, notes: [] }])] });

    // Assert
    expect(error.message).toBe('measures[0].parts[0].beats[1].duration: expected one of whole, half, quarter, eighth, 16th, 32nd, 64th');
  });

  it.each([
    ['neither string, fret nor pitch', { tied: true }],
    ['a string without a fret', { string: 2 }],
    ['a fret without a string', { fret: 2 }],
    ['an unreadable pitch', { pitch: 'H4' }],
    ['a pitch that is not text', { pitch: 64 }],
    ['a string and fret that are not numbers', { string: '2', fret: '3' }],
  ])('rejects a note with %s', (_case, note) => {
    // Act
    const error = errorOf({ measures: [rawBar([{ duration: 'quarter', notes: [{ string: 1, fret: 0 }, note] }])] });

    // Assert
    expect(error.message).toBe('measures[0].parts[0].beats[0].notes[1]: expected a string and fret, a pitch such as "C#4" or a drum such as "Acoustic Snare"');
  });

  it('rejects a note that is not an object', () => {
    // Act
    const error = errorOf({ measures: [rawBar([{ duration: 'quarter', notes: ['E4'] }])] });

    // Assert
    expect(error.message).toBe('measures[0].parts[0].beats[0].notes[0]: expected an object');
  });

  it.each([-1, 1.5, '0', undefined])('rejects a part whose track index is %j', (track) => {
    // Act
    const error = errorOf({ measures: [{ parts: [{ track, beats: [] }] }] });

    // Assert
    expect(error.message).toBe('measures[0].parts[0].track: expected a track index (0 or more)');
  });

  it('rejects a part for a track the page does not list', () => {
    // Act
    const error = errorOf({ tracks: [GUITAR, BASS], measures: [rawBar([]), { parts: [{ track: 2, beats: [] }] }] });

    // Assert
    expect(error.message).toBe('measures[1].parts[0].track: 2 is out of range (the page lists 2 tracks)');
  });

  it.each([
    { numerator: 4, denominator: 3 },
    { numerator: 0, denominator: 4 },
    { numerator: 33, denominator: 4 },
    { numerator: 3.5, denominator: 4 },
    { numerator: 4 },
    '4/4',
  ])('rejects the time signature %j', (timeSignature) => {
    // Act
    const error = errorOf({ measures: [rawBar([], { timeSignature })] });

    // Assert
    expect(error.message).toBe('measures[0].timeSignature: expected a numerator 1–32 over a denominator 1, 2, 4, 8, 16 or 32');
  });
});

describe('parseTranscriptionPage: every kind of staff', () => {
  it('returns a full band page as it was given: drums, guitars, bass, vocals and both hands of a piano', () => {
    // Arrange
    const value = page(
      [
        {
          parts: [
            { track: 0, beats: [play('quarter', drum('Bass Drum 1'), drum('Closed Hi-Hat', { effects: ['accent'] })), play('quarter', drum('Acoustic Snare', { effects: ['ghostNote'] }))] },
            { track: 1, beats: [play('half', tab(6, 0))] },
            { track: 2, beats: [play('half', written('E2'))] },
            { track: 3, beats: [play('quarter', written('G4')), rest('quarter')] },
            { track: 4, beats: [play('half', written('C5'), written('E5'), written('G5'))] },
            { track: 5, beats: [play('half', written('C3'), written('G3'))] },
          ],
          lyrics: ['Love'],
        },
      ],
      { song: { lyricsTrack: 3 }, tracks: [DRUMS, GUITAR, BASS, VOCALS, PIANO_RIGHT, PIANO_LEFT] },
    );

    // Act
    const parsed = parseTranscriptionPage(JSON.parse(JSON.stringify(value)));

    // Assert
    expect(parsed).toEqual(value);
  });

  it('reads a drum by its General MIDI name in any case, and keeps the name as General MIDI spells it', () => {
    expect(parseNote({ drum: ' closed hi-hat ' })).toEqual({ drum: 'Closed Hi-Hat' });
    expect(parseNote({ drum: 'RIDE BELL', effects: ['accent', 'accent'] })).toEqual({ drum: 'Ride Bell', effects: ['accent'] });
  });

  it('rejects a note that names an unknown drum and has nothing else to read', () => {
    expect(() => parseNote({ drum: 'Kick' })).toThrow(/a drum/);
    expect(() => parseNote({ drum: 36 })).toThrow(TranscriptionError);
  });

  it('keeps a pitch or a tab position given beside an unknown drum', () => {
    expect(parseNote({ drum: 'Kick', pitch: 'F4' })).toEqual({ pitch: 'F4' });
  });

  it('reads each instrument, a General MIDI program rounded into 0–127 and a treble or bass clef', () => {
    // Act
    const parsed = parseTranscriptionPage({
      tracks: [
        { name: 'Violin', instrument: 'other', program: 40.4, clef: 'treble' },
        { name: 'Tuba', instrument: 'other', program: 200, clef: 'bass' },
        { name: 'Synth', instrument: 'keys', program: -3, clef: 'alto' },
        { name: 'Uke', instrument: 'ukulele', tuning: ['G4', 'C4', 'E4', 'A4'] },
        { name: 'Banjo', instrument: 'banjo', program: 'banjo' },
        { name: 'Drums', instrument: 'drums' },
        { name: 'Voice', instrument: 'vocals' },
      ],
      measures: [],
    });

    // Assert
    expect(parsed.tracks).toEqual([
      { name: 'Violin', instrument: 'other', tuning: [], capo: 0, program: 40, clef: 'treble' },
      { name: 'Tuba', instrument: 'other', tuning: [], capo: 0, program: 127, clef: 'bass' },
      { name: 'Synth', instrument: 'keys', tuning: [], capo: 0, program: 0 },
      { name: 'Uke', instrument: 'ukulele', tuning: ['G4', 'C4', 'E4', 'A4'], capo: 0 },
      { name: 'Banjo', instrument: 'banjo', tuning: [], capo: 0 },
      { name: 'Drums', instrument: 'drums', tuning: [], capo: 0 },
      { name: 'Voice', instrument: 'vocals', tuning: [], capo: 0 },
    ]);
  });
});

describe('parseTranscriptionPage: odd tracks', () => {
  it('reads an instrument it does not know as the kind it names, else as other, and says so', () => {
    // Act
    const parsed = parseTranscriptionPage({
      tracks: [
        { name: 'Piano', instrument: 'piano' },
        { name: 'Violin', instrument: 'Violin' },
        { name: 'Lead', instrument: 'lead vocal' },
        { name: 'Kit', instrument: 'drum kit' },
        { name: 'Rhythm', instrument: 'electric guitar' },
        { name: 'Uke', instrument: 'uke' },
        { name: 'Low', instrument: 'BASS' },
        { name: 'Missing' },
      ],
      measures: [],
    });

    // Assert
    expect(parsed.tracks?.map((track) => track.instrument)).toEqual(['keys', 'other', 'vocals', 'drums', 'guitar', 'ukulele', 'bass', 'guitar']);
    expect(parsed.warnings).toEqual([
      'Track 1 (Piano): instrument "piano" read as keys',
      'Track 2 (Violin): instrument "Violin" read as other',
      'Track 3 (Lead): instrument "lead vocal" read as vocals',
      'Track 4 (Kit): instrument "drum kit" read as drums',
      'Track 5 (Rhythm): instrument "electric guitar" read as guitar',
      'Track 6 (Uke): instrument "uke" read as ukulele',
      'Track 7 (Low): instrument "BASS" read as bass',
    ]);
  });

  it('cuts an endless tuning and an endless name, so an answer cannot make them allocate without bound', () => {
    // Act
    const parsed = parseTranscriptionPage({
      tracks: [{ name: 'N'.repeat(10000), instrument: 'guitar', tuning: Array.from({ length: 10000 }, () => 'E2'.repeat(100)) }],
      measures: [],
    });

    // Assert
    const [track] = parsed.tracks ?? [];
    expect(track?.name).toHaveLength(MAX_TRANSCRIBED_NAME_LENGTH);
    expect(track?.tuning).toHaveLength(MAX_TRANSCRIBED_TUNING_STRINGS);
    expect(track?.tuning.every((text) => text.length <= 8)).toBe(true);
  });
});
