import { describe, expect, it } from 'vitest';
import { GpFormatError, readSong } from '../src';
import type { Beat, Note, Song } from '../src/model/song';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { buildLegacyGtp, type LegacyBeatSpec, type LegacySongSpec } from './helpers/gtp-legacy-builder';
import { assertSongInvariants } from './helpers/invariants';

const V100 = 'FICHIER GUITARE PRO v1';
const V101 = 'FICHIER GUITARE PRO v1.01';
const V102 = 'FICHIER GUITARE PRO v1.02';
const V103 = 'FICHIER GUITARE PRO v1.03';
const V104 = 'FICHIER GUITARE PRO v1.04';

const NOTE = (bit: number, fret: number, extra: Partial<{ effect: number; bendByte: number }> = {}) => ({
  bit,
  fret,
  ...extra,
});
const QUARTER_NOTE: LegacyBeatSpec = { duration: 0, notes: [NOTE(5, 3)] };

function readGp1(spec: Omit<LegacySongSpec, 'version'> & { version?: string }): Song {
  return readSong(buildLegacyGtp({ version: V104, ...spec }));
}

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

function firstNote(song: Song, beat = 0, track = 0, measure = 0): Note | undefined {
  return beatsOf(song, track, measure)[beat]?.voices[0]?.notes[0];
}

/** One measure, track 1 only, with the given beats. */
function oneMeasure(beats: readonly LegacyBeatSpec[], version = V104): Song {
  return readGp1({ version, measures: [{ tracks: [beats] }] });
}

// Real .gtp files are not committed (no redistribution license): run test/fixtures/fetch-gtp.sh.
const HAS_REAL_FILES = listFixtures('guitarpro1').length > 0;

describe.skipIf(!HAS_REAL_FILES)('GP1 fixture sweep', () => {
  const files = listFixtures('guitarpro1');

  it('has fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('reads %s and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('guitarpro1', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('gp1');
    assertSongInvariants(song);
  });
});

describe.skipIf(!HAS_REAL_FILES)('GP1 real files', () => {
  it('reads Carulli "Allegro" (v1.04): info, eight tracks, tuning and first beats', () => {
    // Arrange
    const bytes = loadFixture('guitarpro1', 'carulli-allegro.gtp');

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source).toEqual({ format: 'gp1', version: V104 });
    expect(song.info.title).toBe('Allegro');
    expect(song.info.music).toBe('Carulli');
    expect(song.info.words).toBe('Carulli');
    expect(song.tracks).toHaveLength(8);
    expect(song.measureHeaders).toHaveLength(25);
    expect(song.measureHeaders[0]).toMatchObject({ start: 960, tempo: 120, tripletFeel: 'none' });
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(song.tracks[7]?.name).toBe('Percussions');
    const beats = beatsOf(song);
    expect(beats.map((beat) => beat.start).slice(0, 3)).toEqual([960, 1440, 1920]);
    expect(beats[0]?.voices[0]?.duration.value).toBe(8);
    expect(beats[2]?.voices[0]?.notes[0]).toMatchObject({ string: 1, fret: 1, velocity: 95 });
    expect(beats[2]?.voices[0]?.notes[0]?.effect.hammer).toBe(true);
    expect(beats[3]?.voices[0]?.notes.map((n) => [n.string, n.fret, n.effect.hammer])).toEqual([
      [1, 0, false],
      [5, 0, false],
    ]);
  });

  it('reads Carulli "Allegro" channels: GM names in TuxGuitar style, track 8 is percussion', () => {
    // Act
    const song = readSong(loadFixture('guitarpro1', 'carulli-allegro.gtp'));

    // Assert
    expect(song.channels.map((channel) => channel.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(song.channels[0]).toMatchObject({ program: 24, volume: 127, balance: 64, bank: 0 });
    expect(song.channels[0]?.name).toBe('Nylon String Acoustic Guitar 1');
    expect(song.channels[1]?.name).toBe('Nylon String Acoustic Guitar 2');
    expect(song.channels[7]).toMatchObject({ bank: 128, program: 0, isPercussion: true });
    expect(song.tracks[7]?.isPercussion).toBe(true);
    expect(song.tracks.map((track) => track.channelId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('reads "Layla" (v1.02): one track called "Track 1", triplet feel, tied notes across a bar line', () => {
    // Act
    const song = readSong(loadFixture('guitarpro1', 'layla-acoustic.gtp'));

    // Assert
    expect(song.source.version).toBe(V102);
    expect(song.info).toMatchObject({ title: 'Layla (Acoustic) - Guitar 1', music: 'Eric Clapton and Jim Gordon' });
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0]?.name).toBe('Track 1');
    expect(song.channels[0]?.program).toBe(25);
    expect(song.measureHeaders).toHaveLength(100);
    expect(song.measureHeaders.every((header) => header.tripletFeel === 'eighth')).toBe(true);
    expect(song.measureHeaders[0]?.tempo).toBe(96);
    const firstBar = beatsOf(song, 0, 0);
    expect(firstBar.map((beat) => beat.start)).toEqual([960, 2880, 3360, 3840, 4320]);
    expect(firstBar[0]?.voices[0]).toMatchObject({ isEmpty: false, notes: [] });
    expect(firstBar[4]?.chord).toBeUndefined();
    const tied = beatsOf(song, 0, 1)[0]?.voices[0]?.notes ?? [];
    expect(tied.map((note) => [note.string, note.fret, note.isTied])).toEqual([
      [3, 2, true],
      [4, 0, true],
    ]);
  });

  it('reads "Sweet Child O Mine" (v1.03): eight tracks with names and 180 measures', () => {
    // Act
    const song = readSong(loadFixture('guitarpro1', 'sweet-child-o-mine.gtp'));

    // Assert
    expect(song.source.version).toBe(V103);
    expect(song.info.title).toBe('Sweet Child O Mine');
    expect(song.info.music).toBe('Guns n Roses');
    expect(song.tracks.map((track) => track.name).slice(0, 2)).toEqual(['Gtr. 1', 'Gtr 2']);
    expect(song.measureHeaders).toHaveLength(180);
  });
});

describe('GP1 header and tracks per version', () => {
  it('v1 and v1.01 store one track with six tunings and no string count', () => {
    // Arrange
    const spec = { tracks: [{ tuning: [62, 57, 53, 48, 43, 38], program: 30 }], title: 'Old', author: 'Me' };

    // Act
    const songs = [V100, V101].map((version) => readGp1({ ...spec, version }));

    // Assert
    for (const song of songs) {
      expect(song.tracks).toHaveLength(1);
      expect(song.tracks[0]?.strings).toEqual([
        { number: 1, tuning: 62 },
        { number: 2, tuning: 57 },
        { number: 3, tuning: 53 },
        { number: 4, tuning: 48 },
        { number: 5, tuning: 43 },
        { number: 6, tuning: 38 },
      ]);
      expect(song.tracks[0]).toMatchObject({ name: 'Track 1', offset: 0, solo: false, mute: false });
      expect(song.channels[0]).toMatchObject({ id: 1, program: 30, volume: 127, balance: 64, chorus: 0, reverb: 0 });
      expect(song.info).toMatchObject({ title: 'Old', music: 'Me', words: 'Me', artist: '', notice: [] });
    }
  });

  it('v1.02 reads a string count per track', () => {
    // Act
    const song = readGp1({ version: V102, tracks: [{ tuning: [43, 38, 33, 28] }] });

    // Assert
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([43, 38, 33, 28]);
    expect(song.tracks[0]?.measures[0]?.clef).toBe('bass');
  });

  it('v1.03 reads eight tracks with name, solo, mixer values, capo and the key signature', () => {
    // Arrange
    const track = { name: 'Lead', solo: true, volume: 100, balance: 30, chorus: 5, reverb: 7, offset: 2, program: 29 };

    // Act
    const song = readGp1({ version: V103, keySignature: -3, tracks: [track] });

    // Assert
    expect(song.tracks).toHaveLength(8);
    expect(song.tracks[0]).toMatchObject({ name: 'Lead', solo: true, offset: 2 });
    expect(song.channels[0]).toMatchObject({ program: 29, volume: 100, balance: 30, chorus: 5, reverb: 7 });
    expect(song.tracks[0]?.measures[0]?.keySignature).toBe(-3);
    expect(song.tracks[0]?.color).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('decodes padded info blocks and honours the charset option', () => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V104, title: 'Café', infoBlockSize: 40 });

    // Act
    const song = readSong(bytes, { charset: 'windows-1252' });

    // Assert
    expect(song.info.title).toBe('Café');
  });
});

describe('GP1 durations and positions', () => {
  it('maps duration bytes -2…4 to whole…sixty-fourth and lays beats end to end', () => {
    // Arrange
    const beats = [-2, -1, 0, 1, 2, 3, 4].map((duration) => ({ duration, notes: [NOTE(5, 0)] }));

    // Act
    const song = readGp1({ measures: [{ numerator: 8, denominator: 4, tracks: [beats] }] });

    // Assert
    const read = beatsOf(song);
    expect(read.slice(0, 7).map((beat) => beat.voices[0]?.duration.value)).toEqual([1, 2, 4, 8, 16, 32, 64]);
    expect(read.slice(0, 7).map((beat) => beat.start)).toEqual([960, 4800, 6720, 7680, 8160, 8400, 8520]);
  });

  it('reads dotted notes and triplets (3:2) with their skipped byte', () => {
    // Arrange
    const beats: LegacyBeatSpec[] = [
      { duration: 0, dotted: true, notes: [NOTE(5, 1)] },
      { duration: 1, triplet: true, notes: [NOTE(5, 2)] },
      { duration: 1, triplet: true, notes: [NOTE(5, 3)] },
      { duration: 1, triplet: true, notes: [NOTE(5, 4)] },
      { duration: 1, notes: [NOTE(5, 5)] },
      { duration: 0, notes: [NOTE(5, 6)] },
    ];

    // Act
    const read = beatsOf(oneMeasure(beats));

    // Assert
    expect(read[0]?.voices[0]?.duration).toMatchObject({ value: 4, dotted: true, doubleDotted: false });
    expect(read[1]?.voices[0]?.duration.tuplet).toEqual({ enters: 3, times: 2 });
    expect(read.map((beat) => beat.start)).toEqual([960, 2400, 2720, 3040, 3360, 3840]);
    expect(read.map((beat) => beat.voices[0]?.notes[0]?.fret)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('starts the first measure at one quarter and follows time-signature changes', () => {
    // Act
    const song = readGp1({ measures: [{ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }, {}] });

    // Assert
    expect(song.measureHeaders.map((header) => header.start)).toEqual([960, 3840, 6720]);
    expect(song.measureHeaders[1]?.timeSignature).toEqual({ numerator: 6, denominator: 8 });
    expect(song.measureHeaders.map((header) => header.number)).toEqual([1, 2, 3]);
  });

  it('gives every beat two voices, the second one empty', () => {
    // Act
    const beat = beatsOf(oneMeasure([QUARTER_NOTE]))[0];

    // Assert
    expect(beat?.voices).toHaveLength(2);
    expect(beat?.voices[1]).toMatchObject({ isEmpty: true, notes: [], direction: 'none' });
    expect(beat?.voices[0]?.isEmpty).toBe(false);
    expect(beat).toMatchObject({ stroke: { direction: 'none', value: 0 }, pickStroke: 'none' });
  });
});

describe('GP1 rests completed like TuxGuitar (autoCompleteSilences)', () => {
  it('fills an empty 4/4 measure with one whole rest and an empty 3/4 measure with three quarter rests', () => {
    // Act
    const song = readGp1({ measures: [{}, { numerator: 3, denominator: 4 }] });

    // Assert
    const whole = beatsOf(song, 0, 0);
    expect(whole).toHaveLength(1);
    expect(whole[0]?.voices[0]).toMatchObject({ isEmpty: false, notes: [], duration: { value: 1 } });
    expect(beatsOf(song, 0, 1).map((beat) => [beat.start, beat.voices[0]?.duration.value])).toEqual([
      [4800, 4],
      [5760, 4],
      [6720, 4],
    ]);
    expect(beatsOf(song, 3, 0)).toHaveLength(1);
  });

  it('completes a short measure with rests after the last beat', () => {
    // Act
    const read = beatsOf(oneMeasure([QUARTER_NOTE]));

    // Assert
    expect(read.map((beat) => [beat.start, beat.voices[0]?.duration.value, beat.voices[0]?.notes.length])).toEqual([
      [960, 4, 1],
      [1920, 4, 0],
      [2880, 4, 0],
      [3840, 4, 0],
    ]);
  });

  it('splits an incomplete triplet gap exactly as TGDuration.splitPreciseDuration does', () => {
    // Act
    const read = beatsOf(oneMeasure([{ duration: 1, triplet: true, notes: [NOTE(5, 0)] }]));

    // Assert
    const rests = read.slice(1);
    expect(rests.slice(0, 3).map((beat) => beat.voices[0]?.duration)).toEqual(
      Array(3).fill({ value: 64, dotted: false, doubleDotted: false, tuplet: { enters: 9, times: 8 } }),
    );
    expect(rests.slice(3).map((beat) => beat.voices[0]?.duration.value)).toEqual(Array(7).fill(8));
    expect(rests.map((beat) => beat.start)).toEqual([1280, 1333, 1386, 1440, 1920, 2400, 2880, 3360, 3840, 4320]);
  });

  it('leaves an over-full measure as written', () => {
    // Act
    const read = beatsOf(oneMeasure([{ duration: -2, notes: [NOTE(5, 0)] }, QUARTER_NOTE]));

    // Assert
    expect(read.map((beat) => beat.start)).toEqual([960, 4800]);
  });

  it('treats a beat-count byte above 127 as zero beats', () => {
    // Act
    const song = readGp1({ measures: [{ beatCounts: [200] }] });

    // Assert
    expect(beatsOf(song)).toHaveLength(1);
    expect(beatsOf(song)[0]?.voices[0]?.notes).toEqual([]);
  });
});

describe('GP1 notes', () => {
  it('numbers strings from the string mask (bit 5 = string 1 on six strings) with velocity forte', () => {
    // Act
    const notes = beatsOf(oneMeasure([{ duration: 0, notes: [NOTE(5, 1), NOTE(2, 4), NOTE(0, 6)] }]))[0]?.voices[0]
      ?.notes;

    // Assert
    expect(notes?.map((note) => [note.string, note.fret, note.velocity, note.isTied])).toEqual([
      [1, 1, 95, false],
      [4, 4, 95, false],
      [6, 6, 95, false],
    ]);
  });

  it('numbers strings from the low bits on a four-string track', () => {
    // Act
    const song = readGp1({
      tracks: [{ tuning: [43, 38, 33, 28] }],
      measures: [{ tracks: [[{ duration: 0, notes: [NOTE(3, 5), NOTE(0, 7)] }]] }],
    });

    // Assert
    expect(firstNote(song)).toMatchObject({ string: 1, fret: 5 });
    expect(beatsOf(song)[0]?.voices[0]?.notes[1]).toMatchObject({ string: 4, fret: 7 });
  });

  it('drops notes addressed to strings the track does not have, but still reads their bytes', () => {
    // Act
    const song = readGp1({
      tracks: [{ tuning: [43, 38, 33, 28] }],
      measures: [
        {
          tracks: [
            [
              { duration: 0, notes: [NOTE(5, 1, { effect: 5, bendByte: 240 }), NOTE(3, 2)] },
              { duration: 0, notes: [NOTE(0, 3)] },
            ],
          ],
        },
      ],
    });

    // Assert
    expect(beatsOf(song).slice(0, 2).map((beat) => beat.voices[0]?.notes.map((n) => [n.string, n.fret]))).toEqual([
      [[1, 2]],
      [[4, 3]],
    ]);
  });

  it('turns frets of 100 and above into dead notes on fret 0', () => {
    // Act
    const note = firstNote(oneMeasure([{ duration: 0, notes: [NOTE(5, 100)] }]));

    // Assert
    expect(note?.fret).toBe(0);
    expect(note?.effect.deadNote).toBe(true);
  });

  it('reads rests as non-empty voices without notes', () => {
    // Act
    const beat = beatsOf(oneMeasure([{ duration: 0, rest: true }]))[0];

    // Assert
    expect(beat?.voices[0]).toMatchObject({ isEmpty: false, notes: [] });
  });

  it('copies the previous beat’s notes as tied notes, also across a bar line', () => {
    // Arrange
    const first: LegacyBeatSpec = { duration: -1, notes: [NOTE(5, 3, { effect: 1 }), NOTE(4, 5)] };

    // Act
    const song = readGp1({
      measures: [{ tracks: [[first, { duration: -1, tied: true }]] }, { tracks: [[{ duration: -2, tied: true }]] }],
    });

    // Assert
    const inBar = beatsOf(song, 0, 0)[1]?.voices[0]?.notes;
    const nextBar = beatsOf(song, 0, 1)[0]?.voices[0]?.notes;
    for (const notes of [inBar, nextBar]) {
      expect(notes?.map((note) => [note.string, note.fret, note.velocity, note.isTied])).toEqual([
        [1, 3, 95, true],
        [2, 5, 95, true],
      ]);
      expect(notes?.[0]?.effect.hammer).toBe(false);
    }
  });

  it('gives a tied beat no notes when nothing was read before it or the previous beat is a rest', () => {
    // Act
    const song = readGp1({
      measures: [{ tracks: [[{ duration: -1, tied: true }, { duration: 0, rest: true }, { duration: 0, tied: true }]] }],
    });

    // Assert
    expect(beatsOf(song).map((beat) => beat.voices[0]?.notes.length)).toEqual([0, 0, 0]);
  });
});

describe('GP1 effects', () => {
  it.each([
    [1, 'vibrato'],
    [2, 'vibrato'],
    [4, 'fadeIn'],
    [5, 'tapping'],
    [6, 'slapping'],
    [7, 'popping'],
  ] as const)('beat effect %i sets %s on every note of the beat', (code, flag) => {
    // Act
    const notes = beatsOf(oneMeasure([{ duration: 0, beatEffect: code, notes: [NOTE(5, 0), NOTE(4, 0)] }]))[0]
      ?.voices[0]?.notes;

    // Assert
    expect(notes?.map((note) => note.effect[flag])).toEqual([true, true]);
  });

  it('beat effects 8 and 9 add natural and artificial harmonics', () => {
    // Act
    const song = oneMeasure([
      { duration: 0, beatEffect: 8, notes: [NOTE(5, 12)] },
      { duration: 0, beatEffect: 9, notes: [NOTE(5, 5)] },
    ]);

    // Assert
    expect(firstNote(song, 0)?.effect.harmonic).toEqual({ type: 'natural', data: 0 });
    expect(firstNote(song, 1)?.effect.harmonic).toEqual({ type: 'artificial', data: 12 });
  });

  it('beat effect 3 is a bend: value max(byte / 8 - 26, 1) quarter tones at positions 0, 6, 12', () => {
    // Act
    const song = oneMeasure([
      { duration: 0, beatEffect: 3, beatBendByte: 240, notes: [NOTE(5, 7)] },
      { duration: 0, beatEffect: 3, beatBendByte: 0, notes: [NOTE(5, 7)] },
    ]);

    // Assert
    expect(firstNote(song, 0)?.effect.bend?.points).toEqual([
      { position: 0, value: 0 },
      { position: 6, value: 4 },
      { position: 12, value: 4 },
    ]);
    expect(firstNote(song, 1)?.effect.bend?.points[1]).toEqual({ position: 6, value: 1 });
  });

  it.each([
    [1, { hammer: true, slides: [] }],
    [2, { hammer: true, slides: [] }],
    [3, { hammer: false, slides: ['shift'] }],
    [4, { hammer: false, slides: ['shift'] }],
    [7, { hammer: false, slides: [] }],
  ] as const)('note effect %i sets hammer and slide flags as %o', (code, expected) => {
    // Act
    const note = firstNote(oneMeasure([{ duration: 0, notes: [NOTE(5, 3, { effect: code })] }]));

    // Assert
    expect(note?.effect).toMatchObject(expected);
    expect(note?.effect.bend).toBeUndefined();
  });

  it('note effects 5 and 6 are bends', () => {
    // Act
    const song = oneMeasure([
      { duration: 0, notes: [NOTE(5, 3, { effect: 5, bendByte: 224 })] },
      { duration: 0, notes: [NOTE(5, 3, { effect: 6, bendByte: 248 })] },
    ]);

    // Assert
    expect(firstNote(song, 0)?.effect.bend?.points[2]).toEqual({ position: 12, value: 2 });
    expect(firstNote(song, 1)?.effect.bend?.points[2]).toEqual({ position: 12, value: 5 });
  });

  it('keeps note effects on their own note and combines them with the beat effect', () => {
    // Act
    const notes = beatsOf(
      oneMeasure([{ duration: 0, beatEffect: 1, notes: [NOTE(5, 3, { effect: 1 }), NOTE(4, 3), NOTE(3, 3, { effect: 3 })] }]),
    )[0]?.voices[0]?.notes;

    // Assert
    expect(notes?.map((note) => [note.effect.vibrato, note.effect.hammer, note.effect.slides])).toEqual([
      [true, true, []],
      [true, false, []],
      [true, false, ['shift']],
    ]);
  });

  it('keeps every flag the file sets, without TuxGuitar’s incompatible-effect clearing', () => {
    // Act
    const notes = beatsOf(
      oneMeasure([
        { duration: 0, beatEffect: 3, beatBendByte: 240, notes: [NOTE(5, 3, { effect: 1 }), NOTE(4, 100, { effect: 3 })] },
      ]),
    )[0]?.voices[0]?.notes;

    // Assert
    expect(notes?.[0]?.effect).toMatchObject({ hammer: true, deadNote: false });
    expect(notes?.[0]?.effect.bend?.points[1]?.value).toBe(4);
    expect(notes?.[1]?.effect).toMatchObject({ deadNote: true, slides: ['shift'] });
    expect(notes?.[1]?.effect.bend).toBeDefined();
  });

  it('lets a note bend replace the beat bend', () => {
    // Act
    const note = firstNote(
      oneMeasure([{ duration: 0, beatEffect: 3, beatBendByte: 240, notes: [NOTE(5, 3, { effect: 5, bendByte: 224 })] }]),
    );

    // Assert
    expect(note?.effect.bend?.points[1]?.value).toBe(2);
  });
});

describe('GP1 chords, text, repeats and clefs', () => {
  it('reads full chords (v1.04) with and without the 32-byte block', () => {
    // Act
    const song = oneMeasure([
      { duration: 0, chord: { name: 'Am', kind: 0, firstFret: 1, frets: [0, 1, 2, 2, 0, -1] }, notes: [NOTE(5, 0)] },
      { duration: 0, chord: { name: 'G', kind: 12, firstFret: 3, frets: [3, 0, 0, 0, 2, 3] }, notes: [NOTE(5, 3)] },
    ]);

    // Assert
    expect(beatsOf(song)[0]?.chord).toEqual({ name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] });
    expect(beatsOf(song)[1]?.chord).toEqual({ name: 'G', firstFret: 3, frets: [3, 0, 0, 0, 2, 3] });
    expect(firstNote(song, 1)?.fret).toBe(3);
  });

  it('drops chords without frets and keeps only the frets of existing strings', () => {
    // Act
    const song = readGp1({
      tracks: [{ tuning: [43, 38, 33, 28] }],
      measures: [
        {
          tracks: [
            [
              { duration: 0, chord: { name: 'N.C.', firstFret: 0 }, notes: [NOTE(3, 0)] },
              { duration: 0, chord: { name: 'X', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] }, notes: [NOTE(3, 0)] },
              { duration: 0, chord: { name: 'E5', firstFret: 1, frets: [-1, -1, 2, 0, 5, 5] }, notes: [NOTE(3, 0)] },
            ],
          ],
        },
      ],
    });

    // Assert
    expect(beatsOf(song).slice(0, 3).map((beat) => beat.chord)).toEqual([
      undefined,
      undefined,
      { name: 'E5', firstFret: 1, frets: [-1, -1, 2, 0] },
    ]);
  });

  it('skips old-style chord names (v1.03 and earlier)', () => {
    // Act
    const song = oneMeasure([{ duration: 0, oldChord: 'D5', notes: [NOTE(5, 2)] }], V103);

    // Assert
    expect(beatsOf(song)[0]?.chord).toBeUndefined();
    expect(firstNote(song)?.fret).toBe(2);
  });

  it('reads beat text', () => {
    // Act
    const song = oneMeasure([{ duration: 0, text: 'P.M.', notes: [NOTE(5, 0)] }]);

    // Assert
    expect(beatsOf(song)[0]?.text).toBe('P.M.');
    expect(beatsOf(song)[1]?.text).toBeUndefined();
  });

  it('reads repeats and numbers alternate endings after the ones already used', () => {
    // Act
    const song = readGp1({
      measures: [
        { repeatOpen: true },
        { alternative: 1, repeatClose: 2 },
        { alternative: 2 },
        { repeatOpen: true },
        { alternative: 3 },
        {},
      ],
    });

    // Assert
    const headers = song.measureHeaders.map((h) => [h.repeatOpen, h.repeatClose, h.repeatAlternative]);
    expect(headers).toEqual([
      [true, 0, 0],
      [false, 2, 0b001],
      [false, 0, 0b010],
      [true, 0, 0],
      [false, 0, 0b111],
      [false, 0, 0],
    ]);
  });

  it('uses the bass clef when a string is tuned to MIDI 34 or lower', () => {
    // Act
    const song = readGp1({ tracks: [{ tuning: [64, 59, 55, 50, 45, 34] }, { tuning: [64, 59, 55, 50, 45, 35] }] });

    // Assert
    expect(song.tracks[0]?.measures[0]?.clef).toBe('bass');
    expect(song.tracks[1]?.measures[0]?.clef).toBe('treble');
  });
});

describe('GP1 errors', () => {
  it('throws GpFormatError for a truncated file', () => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V104, measures: [{ tracks: [[QUARTER_NOTE]] }] });

    // Act / Assert
    expect(() => readSong(bytes.subarray(0, bytes.length - 3))).toThrow(GpFormatError);
  });

  it.each([
    [4, 0],
    [4, 3],
    [0, 4],
  ])('throws GpFormatError for the time signature %i/%i', (numerator, denominator) => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V104, measures: [{ numerator, denominator }] });

    // Act / Assert
    expect(() => readSong(bytes)).toThrow(/time signature/);
  });

  it.each([-3, 5])('throws GpFormatError for the duration byte %i', (duration) => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V104, measures: [{ tracks: [[{ duration, rest: true }]] }] });

    // Act / Assert
    expect(() => readSong(bytes)).toThrow(/duration/);
  });
});

describe('GP1 corrupt input', () => {
  it('rejects a string count larger than the file instead of allocating it', () => {
    // Arrange: v1.02 puts the first string count after the version block, three empty info
    // strings (2 bytes each), the tempo and the triplet feel.
    const bytes = buildLegacyGtp({ version: V102 });
    const stringCountAt = 31 + 3 * 2 + 4 + 4;
    const corrupt = Uint8Array.from(bytes);
    corrupt.set([0xff, 0xff, 0xff, 0x7f], stringCountAt);

    // Act / Assert
    expect(() => readSong(corrupt)).toThrow(/more than the file can hold/);
  });

  it('names the measure and track when a beat cannot be read', () => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V104, measures: [{}, { tracks: [[], [QUARTER_NOTE]] }] });

    // Act / Assert
    expect(() => readSong(bytes.subarray(0, bytes.length - 2))).toThrow(/Measure 2, track 2/);
  });
});
