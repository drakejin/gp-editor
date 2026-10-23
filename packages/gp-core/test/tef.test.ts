import { describe, expect, it } from 'vitest';
import { GpFormatError, UnsupportedFormatError, readSong } from '../src';
import { detectFormat } from '../src/formats/detect';
import { readTeSong } from '../src/formats/tef/tef-input-stream';
import type { Beat, Song } from '../src/model/song';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { type TefHeaderSpec, buildTef, tefNote } from './helpers/tef-builder';

const TABLEDIT_FILES = listFixtures('tabledit').filter((name) => name.endsWith('.tef'));
const READABLE_FILES = TABLEDIT_FILES.filter((name) => !name.startsWith('invalid_'));

function read(name: string): Song {
  return readSong(loadFixture('tabledit', name));
}

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

/** Beat starts from the measure start. */
function offsetsOf(song: Song, track = 0, measure = 0): number[] {
  const start = song.measureHeaders[measure]?.start ?? 0;
  return beatsOf(song, track, measure).map((beat) => beat.start - start);
}

describe('TablEdit detection', () => {
  it('detects TablEdit 3 files with their version', () => {
    for (const name of TABLEDIT_FILES) {
      expect(detectFormat(loadFixture('tabledit', name)), name).toEqual({ format: 'tef', version: '3.04' });
    }
  });

  it('takes the tag in TuxGuitar’s byte order too', () => {
    expect(detectFormat(buildTef({ header: { tag: 'tbed', minorVersion: 1 } }))).toEqual({ format: 'tef', version: '3.01' });
  });

  it.each<[string, TefHeaderSpec]>([
    ['another major version', { majorVersion: 2 }],
    ['a byte set in the zero block', { zeroBlockByte: 1 }],
    ['another tag', { tag: 'tabs' }],
    ['another old number', { oldNum: 5 }],
    ['another format low byte', { formatLo: 3 }],
    ['another format high byte', { formatHi: 11 }],
  ])('does not take a header with %s for TablEdit', (_name, header) => {
    expect(detectFormat(buildTef({ header }))).toBeUndefined();
  });

  it('does not take bytes shorter than the header for TablEdit', () => {
    expect(detectFormat(buildTef().subarray(0, 255))).toBeUndefined();
  });

  it('rejects bytes without a TablEdit header in the reader itself', () => {
    expect(() => readTeSong(buildTef({ header: { majorVersion: 2 } }), 'auto')).toThrow(UnsupportedFormatError);
  });
});

describe('TablEdit fixture sweep', () => {
  it('has fixtures', () => {
    expect(READABLE_FILES.length).toBeGreaterThan(50);
  });

  it.each(READABLE_FILES)('reads %s and passes the song invariants', (name) => {
    // Act
    const song = read(name);

    // Assert
    expect(song.source).toEqual({ format: 'tef', version: '3.04' });
    assertSongInvariants(song);
  });

  it.each([
    ['invalid_measure_denominator.tef', 'Invalid time signature 4/0 in TablEdit measure 3'],
    ['invalid_text_zero_size.tef', 'A TablEdit file needs at least one track'],
  ])('rejects %s', (name, message) => {
    expect(() => read(name)).toThrow(GpFormatError);
    expect(() => read(name)).toThrow(message);
  });

  it('reads invalid_text_marker_index.tef, leaving out the text its marker cannot name', () => {
    expect(beatsOf(read('invalid_text_marker_index.tef'))[0]?.text).toBeUndefined();
  });
});

describe('TablEdit real files', () => {
  it('reads guitar.tef: song texts, the track, its sound and tuning, one whole note', () => {
    // Act
    const song = read('guitar.tef');

    // Assert
    expect(song.info).toMatchObject({ title: 'Guitar (standard)', notice: ['TablEdited by '] });
    expect(song.tracks[0]).toMatchObject({ name: 'Guitar Standard', offset: 0, isPercussion: false });
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(song.channels[0]).toMatchObject({ program: 25, volume: 127, balance: 59, bank: 0 });
    const voice = beatsOf(song)[0]?.voices[0];
    expect(voice?.duration.value).toBe(1);
    expect(voice?.notes).toEqual([expect.objectContaining({ string: 5, fret: 3, velocity: 95, isTied: false })]);
  });

  it('reads capo_1.tef: open strings without the capo, the capo as the track offset', () => {
    // Act
    const song = read('capo_1.tef');

    // Assert
    expect(song.tracks[0]?.offset).toBe(2);
    expect(song.tracks[0]?.strings.map((s) => s.tuning)).toEqual([64, 59, 55, 50, 45, 40]);
    expect(beatsOf(song)[0]?.voices[0]?.notes[0]).toMatchObject({ string: 5, fret: 0 });
  });

  it('reads notes_normal.tef: every note value from the whole note to the 64th, on the 64th grid', () => {
    // Act
    const song = read('notes_normal.tef');

    // Assert
    expect(beatsOf(song, 0, 1).map((beat) => beat.voices[0]?.duration.value)).toEqual([2, 4, 8, 16, 32, 64, 64]);
    expect(offsetsOf(song, 0, 1)).toEqual([0, 1920, 2880, 3360, 3600, 3720, 3780]);
  });

  it('reads rests_normal.tef: rests of their written lengths', () => {
    // Act
    const song = read('rests_normal.tef');

    // Assert
    const voices = beatsOf(song, 0, 1).map((beat) => beat.voices[0]);
    expect(voices.map((voice) => [voice?.duration.value, voice?.notes.length, voice?.isEmpty])).toEqual([
      [2, 0, false],
      [4, 0, false],
      [8, 0, false],
      [16, 0, false],
      [32, 0, false],
      [64, 0, false],
      [64, 0, false],
    ]);
  });

  it.each([
    ['triplet_eighths.tef', [0, 960, 1280, 1600, 1920, 2880]],
    ['triplet_quarters.tef', [0, 960, 1600, 2240, 2880]],
    ['triplets_mixed.tef', [0, 640, 960, 1920, 2240, 2880]],
  ])('reads %s: triplets where they sound, not where TablEdit’s grid draws them', (name, offsets) => {
    expect(offsetsOf(read(name))).toEqual(offsets);
  });

  it('reads voices.tef: upper and lower voices on shared beats', () => {
    // Act
    const beat = beatsOf(read('voices.tef'), 0, 1)[0];

    // Assert
    expect(beat?.voices.map((voice) => voice.notes.map((note) => note.string))).toEqual([[1], [2]]);
  });

  it('reads dynamic.tef: velocities from fff to ppp (a tie), and the lyrics', () => {
    // Act
    const song = read('dynamic.tef');

    // Assert
    const notes = beatsOf(song).map((beat) => beat.voices[0]?.notes[0]);
    expect(notes.map((note) => note?.velocity)).toEqual([127, 111, 95, 79, 63, 47, 31, 15]);
    expect(notes.map((note) => note?.isTied)).toEqual([false, false, false, false, false, false, false, true]);
    expect(song.tracks[0]?.lyrics).toEqual({ from: 1, text: 'fff ff f mf mp p pp' });
  });

  it('reads grace_1.tef: grace notes with their frets and transitions', () => {
    // Act
    const song = read('grace_1.tef');

    // Assert
    const graces = [0, 1].flatMap((measure) => beatsOf(song, 0, measure).map((beat) => beat.voices[0]?.notes[0]?.effect.grace));
    expect(graces.map((grace) => (grace === undefined ? '-' : `${grace.fret}${grace.transition}`))).toEqual([
      '-',
      '1hammer',
      '1slide',
      '1bend',
      '1hammer',
      '2hammer',
      '3hammer',
      '4hammer',
    ]);
  });

  it('reads effects_1.tef and effects_2.tef: hammer-ons, pull-offs, slides and harmonics', () => {
    // Act
    const effects = read('effects_1.tef');
    const harmonics = read('effects_2.tef');

    // Assert
    expect([1, 2, 3].map((measure) => beatsOf(effects, 0, measure)[0]?.voices[0]?.notes[0]?.effect)).toEqual([
      expect.objectContaining({ hammer: true }),
      expect.objectContaining({ hammer: true }),
      expect.objectContaining({ slides: ['shift'] }),
    ]);
    expect(beatsOf(harmonics)[0]?.voices[0]?.notes[0]?.effect.harmonic?.type).toBe('natural');
    expect(beatsOf(harmonics, 0, 1)[0]?.voices[0]?.notes[0]?.effect.harmonic?.type).toBe('artificial');
    expect(beatsOf(harmonics, 0, 2)[0]?.voices[0]?.notes[0]?.effect.harmonic?.type).toBe('natural');
  });

  it('reads guitar_bass.tef: a guitar and a bass in the bass clef', () => {
    // Act
    const song = read('guitar_bass.tef');

    // Assert
    expect(song.tracks.map((track) => [track.name, track.measures[0]?.clef, track.strings.length])).toEqual([
      ['Guitar Standard', 'treble', 6],
      ['Acoustic Bass', 'bass', 4],
    ]);
    expect(song.channels.map((channel) => channel.program)).toEqual([25, 32]);
  });

  it('reads time_signatures.tef and key_signatures.tef', () => {
    // Act
    const times = read('time_signatures.tef');
    const keys = read('key_signatures.tef');

    // Assert
    expect(times.measureHeaders.map((header) => header.timeSignature)).toEqual([
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ]);
    expect(keys.tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([0, 1, 2, -1]);
  });

  it('reads metadata.tef: title, author (words and music) and copyright', () => {
    // Act
    const info = read('metadata.tef').info;

    // Assert
    expect(info.title).toBe('Hello World');
    expect(info.words).toBe(info.music);
    expect(info.copyright).not.toBe('');
  });

  it('reads staff_text_1.tef: a text on the beat', () => {
    expect(beatsOf(read('staff_text_1.tef'))[0]?.text).toBe('This is text');
  });

  it('reads pickup_measure.tef: a rest before the pickup note', () => {
    // Act
    const song = read('pickup_measure.tef');

    // Assert
    expect(offsetsOf(song)).toEqual([0, 2880]);
    expect(beatsOf(song)[0]?.voices[0]?.notes).toEqual([]);
  });

  it('reads multi_track_frets.tef: a note on each track, the strings counted across the tracks', () => {
    // Act
    const song = read('multi_track_frets.tef');

    // Assert
    expect(song.tracks.map((track) => beatsOf(song, track.number - 1)[0]?.voices[0]?.notes[0]?.string)).toEqual([4, 3, 2]);
  });
});

describe('TablEdit components on the grid', () => {
  it('reads a song made of one note', () => {
    // Act
    const song = readSong(buildTef({ title: 'One', components: [tefNote({ at: { measure: 0, position: 16, string: 2 }, fret: 5 })] }));

    // Assert
    assertSongInvariants(song);
    expect(song.info.title).toBe('One');
    expect(offsetsOf(song)).toEqual([0, 960]);
    expect(beatsOf(song)[1]?.voices[0]?.notes).toEqual([expect.objectContaining({ string: 3, fret: 5 })]);
  });
});
