import { describe, expect, it } from 'vitest';
import { type Beat, type Note, readSong, type Song } from '../src/index';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

// Expected values follow alphaTab's Gp3Importer.test.ts, translated to our model:
// alphaTab numbers strings from the lowest (1 = low E), we from the highest (1 = high E).

function read(name: string): Song {
  return readSong(loadFixture('guitarpro3', name));
}

function beatAt(song: Song, measure: number, index: number, track = 0): Beat {
  const beat = song.tracks[track]?.measures[measure]?.beats[index];
  if (beat === undefined) {
    throw new Error(`no beat ${index} in measure ${measure} of track ${track}`);
  }
  return beat;
}

function firstNote(beat: Beat): Note {
  const note = beat.voices[0]?.notes[0];
  if (note === undefined) {
    throw new Error(`beat at ${beat.start} has no note`);
  }
  return note;
}

function noteOn(beat: Beat, string: number): Note {
  const note = beat.voices[0]?.notes.find((candidate) => candidate.string === string);
  if (note === undefined) {
    throw new Error(`beat at ${beat.start} has no note on string ${string}`);
  }
  return note;
}

describe('readGp3 fixture sweep', () => {
  const fixtures = listFixtures('guitarpro3');

  it('finds the GP3 fixtures', () => {
    expect(fixtures.length).toBe(18);
  });

  it.each(fixtures)('%s parses and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('guitarpro3', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('gp3');
    assertSongInvariants(song);
  });
});

describe('readGp3 values', () => {
  it('reads every score-info field', () => {
    const song = read('score-info.gp3');

    expect(song.source.version).toBe('FICHIER GUITAR PRO v3.00');
    expect(song.info).toEqual({
      title: 'Title',
      subtitle: 'Subtitle',
      artist: 'Artist',
      album: 'Album',
      words: 'Music',
      music: 'Music',
      copyright: 'Copyright',
      transcriber: 'Tab',
      instructions: 'Instructions',
      notice: ['Notice1', 'Notice2'],
    });
    expect(song.measureHeaders).toHaveLength(5);
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]?.name).toBe('Track 1');
  });

  it('reads frets, strings and durations of the notes fixture', () => {
    const song = read('notes.gp3');
    const values = [1, 2, 4, 8, 16, 32, 64];

    values.forEach((value, group) => {
      for (let fret = 1; fret <= 4; fret++) {
        const beat = beatAt(song, 0, group * 5 + fret - 1);
        expect(firstNote(beat)).toMatchObject({ fret, string: 6 });
        expect(beat.voices[0]?.duration.value).toBe(value);
      }
      const rest = beatAt(song, 0, group * 5 + 4);
      expect(rest.voices[0]?.notes).toHaveLength(0);
      expect(rest.voices[0]?.isEmpty).toBe(false);
      expect(rest.voices[0]?.duration.value).toBe(value);
    });
  });

  it('places beats and measures on the TuxGuitar tick grid', () => {
    const song = read('notes.gp3');
    const measure = song.tracks[0]?.measures[0];

    expect(song.measureHeaders[0]?.start).toBe(960);
    expect(measure?.beats.slice(0, 6).map((beat) => beat.start)).toEqual([960, 4800, 8640, 12480, 16320, 20160]);
    expect(measure?.beats[6]?.start).toBe(20160 + 1920);
  });

  it('carries time signatures over from measure to measure', () => {
    const song = read('time-signatures.gp3');

    expect(song.measureHeaders.slice(0, 5).map((header) => header.timeSignature)).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
      { numerator: 2, denominator: 4 },
      { numerator: 1, denominator: 4 },
      { numerator: 20, denominator: 32 },
    ]);
  });

  it('marks dead notes', () => {
    const song = read('dead.gp3');

    [6, 5, 4, 3].forEach((string, index) => {
      expect(firstNote(beatAt(song, 0, index))).toMatchObject({ string, effect: { deadNote: true } });
    });
  });

  it('reads ghost notes, velocities and let ring', () => {
    const song = read('accentuations.gp3');

    expect(firstNote(beatAt(song, 0, 0)).effect.ghostNote).toBe(true);
    expect(firstNote(beatAt(song, 0, 1)).velocity).toBe(127);
    expect(firstNote(beatAt(song, 0, 3)).effect.letRing).toBe(true);
  });

  it('reads note harmonics as natural and artificial', () => {
    const song = read('harmonics.gp3');

    expect(firstNote(beatAt(song, 0, 0)).effect.harmonic).toEqual({ type: 'natural', data: 0 });
    for (let index = 1; index <= 4; index++) {
      expect(firstNote(beatAt(song, 0, index)).effect.harmonic).toEqual({ type: 'artificial', data: 12 });
    }
  });

  it('applies beat harmonics to every note of the beat', () => {
    const song = read('beat-harmonics.gp3');
    const [natural, artificial] = [beatAt(song, 0, 0), beatAt(song, 0, 1)];

    expect(natural.voices[0]?.notes.map((note) => note.effect.harmonic)).toEqual([
      { type: 'natural', data: 0 },
      { type: 'natural', data: 0 },
    ]);
    expect(artificial.voices[0]?.notes.map((note) => note.effect.harmonic)).toEqual([
      { type: 'artificial', data: 12 },
      { type: 'artificial', data: 12 },
    ]);
  });

  it('reads hammer-ons and pull-offs', () => {
    const song = read('hammer.gp3');
    const first = beatAt(song, 0, 0).voices[0]?.notes.map((note) => note.effect.hammer);

    expect(first).toEqual([false, true, true, true]);
    expect(firstNote(beatAt(song, 1, 0)).effect.hammer).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.hammer).toBe(true);
  });

  it('converts bend points to positions 0-12 and quarter tones', () => {
    // alphaTab simplifies the first bend to two points; the file holds three (GP position 15 → 3).
    const song = read('bends.gp3');

    expect(firstNote(beatAt(song, 0, 0)).effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 3, value: 4 },
      { position: 12, value: 4 },
    ]);
    expect(firstNote(beatAt(song, 0, 1)).effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 2, value: 4 },
      { position: 4, value: 4 },
      { position: 6, value: 0 },
      { position: 8, value: 0 },
      { position: 10, value: 4 },
      { position: 12, value: 4 },
    ]);
  });

  it('maps the GP3 slide flag to a shift slide', () => {
    const song = read('slides.gp3');

    expect(noteOn(beatAt(song, 0, 0), 2).effect.slides).toEqual(['shift']);
    expect(noteOn(beatAt(song, 0, 2), 5).effect.slides).toEqual(['shift']);
  });

  it('copies beat vibrato onto the notes', () => {
    const song = read('vibrato.gp3');

    expect(firstNote(beatAt(song, 0, 2)).effect.vibrato).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.vibrato).toBe(true);
  });

  it('reads tapping, slapping, popping, fade in, chords, texts and tempo changes', () => {
    const song = read('other-effects.gp3');

    expect(firstNote(beatAt(song, 0, 2)).effect.tapping).toBe(true);
    expect(firstNote(beatAt(song, 0, 3)).effect.slapping).toBe(true);
    expect(firstNote(beatAt(song, 1, 0)).effect.popping).toBe(true);
    expect(firstNote(beatAt(song, 1, 1)).effect.fadeIn).toBe(true);
    expect(beatAt(song, 3, 0).chord).toEqual({ name: 'C', firstFret: 0, frets: [-1, -1, -1, -1, -1, -1] });
    expect(beatAt(song, 3, 1).text).toBe('Text');
    expect(song.measureHeaders[4]?.tempo).toBe(120);
  });

  it('reads stroke directions', () => {
    const song = read('strokes.gp3');

    expect(beatAt(song, 0, 0).stroke.direction).toBe('down');
    expect(beatAt(song, 0, 1).stroke.direction).toBe('up');
    expect(beatAt(song, 0, 0).stroke.value).toBeGreaterThan(0);
  });

  it('reads triplets and quintuplets', () => {
    const song = read('tuplets.gp3');

    for (let index = 0; index < 3; index++) {
      expect(beatAt(song, 0, index).voices[0]?.duration.tuplet).toEqual({ enters: 3, times: 2 });
    }
    for (let index = 0; index < 5; index++) {
      expect(beatAt(song, 1, index).voices[0]?.duration.tuplet).toEqual({ enters: 5, times: 4 });
    }
  });

  it('reads let ring ranges', () => {
    const song = read('ranges.gp3');

    [1, 2, 3].forEach((index) => expect(firstNote(beatAt(song, 1, index)).effect.letRing).toBe(true));
    expect(firstNote(beatAt(song, 2, 0)).effect.letRing).toBe(true);
  });

  it('numbers strings from the highest and keeps their tuning', () => {
    const song = read('strings.gp3');
    const beat = beatAt(song, 0, 0);

    expect(beat.voices[0]?.notes).toHaveLength(6);
    for (let string = 1; string <= 6; string++) {
      expect(noteOn(beat, string).fret).toBe(string);
    }
    expect(song.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('assigns TuxGuitar-style channels to tracks', () => {
    const song = read('notes.gp3');
    const track = song.tracks[0];
    const channel = song.channels.find((candidate) => candidate.id === track?.channelId);

    expect(song.channels).toHaveLength(1);
    expect(channel?.id).toBe(1);
    expect(channel?.isPercussion).toBe(false);
    expect(channel?.name).toMatch(/ 1$/);
    expect(track?.isPercussion).toBe(false);
  });

  it('gives every beat two voices, the second one empty', () => {
    const song = read('notes.gp3');
    const beat = beatAt(song, 0, 0);

    expect(beat.voices).toHaveLength(2);
    expect(beat.voices[1]).toMatchObject({ isEmpty: true, notes: [] });
  });
});

// ---------------------------------------------------------------- synthetic files
// The fixtures have no GP3/GP4 alternate endings, full GP3 chord diagrams or tremolo dives, so these
// tests build small GP3 files byte by byte (layout as in TuxGuitar's GP3InputStream).

const int = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
/** readStringByteSizeOfInteger */
const sizedText = (text: string): number[] => [...int(text.length + 1), text.length, ...ascii(text)];
/** readStringByte(size) */
const fixedText = (text: string, size: number): number[] => [
  text.length,
  ...ascii(text).concat(new Array<number>(size).fill(0)).slice(0, size),
];

const WHOLE = 0xfe; // duration byte -2
const QUARTER_BYTE = 0;

interface SyntheticGp3 {
  readonly tripletFeel?: boolean;
  readonly key?: number;
  /** Raw measure-header bytes, one entry per measure. */
  readonly headers: readonly (readonly number[])[];
  /** Raw beat bytes per measure (beat count included). */
  readonly measures: readonly (readonly number[])[];
}

function gp3File(file: SyntheticGp3): Uint8Array {
  const version = fixedText('FICHIER GUITAR PRO v3.00', 30);
  const info = [...['T', '', '', '', '', '', '', ''].flatMap(sizedText), ...int(0)];
  const channels = Array.from({ length: 64 }, () => [...int(25), 13, 8, 0, 0, 0, 0, 0, 0]).flat();
  const tuning = [64, 59, 55, 50, 45, 40, 0].flatMap(int);
  const track = [0, ...fixedText('Guitar', 40), ...int(6), ...tuning, ...int(1), ...int(1), ...int(2), ...int(24), ...int(0)];
  return new Uint8Array([
    ...version,
    ...info,
    file.tripletFeel === true ? 1 : 0,
    ...int(120),
    file.key ?? 0,
    0,
    0,
    0,
    ...channels,
    ...int(file.headers.length),
    ...int(1),
    ...file.headers.flat(),
    ...track,
    255,
    0,
    0,
    0,
    ...file.measures.flat(),
  ]);
}

/** One beat measure: a whole rest. */
const REST_MEASURE = [...int(1), 0x00, WHOLE, 0x00];

/** A single quarter-note beat with one note on `string` (note flags 0x20: type + fret). */
function noteMeasure(string: number, noteType: number, fret: number): number[] {
  return [...int(1), 0x00, QUARTER_BYTE, 1 << (7 - string), 0x20, noteType, fret];
}

describe('readGp3 synthetic files', () => {
  it('turns alternate-ending counts into the endings not used since the last repeat open', () => {
    // Arrange: open | ending 1 | close + ending 2 | open | ending 1
    const bytes = gp3File({
      headers: [[0x04], [0x10, 1], [0x18, 1, 2], [0x04], [0x10, 1]],
      measures: Array.from({ length: 5 }, () => REST_MEASURE),
    });

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.measureHeaders.map((header) => [header.repeatOpen, header.repeatClose, header.repeatAlternative])).toEqual([
      [true, 0, 0],
      [false, 0, 1],
      [false, 1, 2],
      [true, 0, 0],
      [false, 0, 1],
    ]);
    assertSongInvariants(song);
  });

  it('applies the song triplet feel and carries key signature changes over', () => {
    const bytes = gp3File({
      tripletFeel: true,
      key: 2,
      headers: [[0x00], [0x40, 0xfe, 0], [0x00]],
      measures: [REST_MEASURE, REST_MEASURE, REST_MEASURE],
    });

    const song = readSong(bytes);

    expect(song.measureHeaders.map((header) => header.tripletFeel)).toEqual(['eighth', 'eighth', 'eighth']);
    expect(song.tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([2, -2, -2]);
  });

  it('reads markers and time signature changes', () => {
    const marker = [...sizedText('Verse'), 0, 128, 255, 0];
    const bytes = gp3File({
      headers: [[0x23, 3, 8, ...marker], [0x00]],
      measures: [[...int(1), 0x01, 1, 0x00], REST_MEASURE],
    });

    const song = readSong(bytes);

    expect(song.measureHeaders[0]).toMatchObject({
      timeSignature: { numerator: 3, denominator: 8 },
      marker: { title: 'Verse', color: { r: 0, g: 128, b: 255 } },
    });
    expect(song.measureHeaders[1]?.start).toBe(960 + 1440);
    expect(song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration).toMatchObject({ value: 8, dotted: true });
  });

  it('resolves tied notes to the previous fret on the string, across measures', () => {
    // Arrange: fret 5 on string 1; then a tie on string 1 and a tie on string 2 with nothing before it
    const tiedBoth = [...int(1), 0x00, QUARTER_BYTE, (1 << 6) | (1 << 5), 0x20, 2, 0, 0x20, 2, 9];
    const bytes = gp3File({ headers: [[0x00], [0x00]], measures: [noteMeasure(1, 1, 5), tiedBoth] });

    // Act
    const notes = readSong(bytes).tracks[0]?.measures[1]?.beats[0]?.voices[0]?.notes;

    // Assert
    expect(notes?.map((note) => [note.string, note.fret, note.isTied])).toEqual([
      [1, 5, true],
      [2, 0, true],
    ]);
  });

  it('reads full chord diagrams', () => {
    const frets = [0, 1, 0, 2, 3, -1].flatMap(int);
    const chord = [0x01, ...new Array<number>(25).fill(0), ...fixedText('C', 34), ...int(1), ...frets, ...new Array<number>(36).fill(0)];
    const bytes = gp3File({ headers: [[0x00]], measures: [[...int(1), 0x02, WHOLE, ...chord, 0x00]] });

    const beat = readSong(bytes).tracks[0]?.measures[0]?.beats[0];

    expect(beat?.chord).toEqual({ name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] });
  });

  it('reads a tremolo bar dive into three points in quarter tones', () => {
    const effects = [0x20, 0, ...int(100)];
    const bytes = gp3File({
      headers: [[0x00]],
      measures: [[...int(1), 0x08, WHOLE, ...effects, 1 << 6, 0x20, 1, 3]],
    });

    const note = readSong(bytes).tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0];

    expect(note?.effect.tremoloBar?.points).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: -4 },
      { position: 12, value: 0 },
    ]);
  });

  it('reads mix-table tempo changes into the measure tempo', () => {
    // instrument, volume … tremolo (all -1 = unchanged), tempo 90, tempo transition
    const mix = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...int(90), 0];
    const bytes = gp3File({
      headers: [[0x00], [0x00]],
      measures: [REST_MEASURE, [...int(1), 0x10, WHOLE, ...mix, 0x00]],
    });

    const song = readSong(bytes);

    expect(song.measureHeaders.map((header) => header.tempo)).toEqual([120, 90]);
  });

  it('wraps read errors with the measure and track that failed', () => {
    const bytes = gp3File({ headers: [[0x00]], measures: [[...int(1), 0x00]] });

    expect(() => readSong(bytes)).toThrow(/measure 1, track 1: Unexpected end of file/);
  });
});
