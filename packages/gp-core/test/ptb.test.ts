import { describe, expect, it } from 'vitest';
import { GpFormatError, UnexpectedEndOfFileError, UnsupportedFormatError, readSong } from '../src';
import { detectFormat } from '../src/formats/detect';
import type { Beat, Song } from '../src/model/song';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { type PtbInfoSpec, type PtbSongSpec, buildPtb } from './helpers/ptb-builder';

const POWER_TAB_FILES = listFixtures('powertab').filter((name) => name.endsWith('.ptb'));

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

function readInfo(info: PtbInfoSpec): Song['info'] {
  return readSong(buildPtb({ info })).info;
}

describe('Power Tab detection', () => {
  it('detects "ptab" with its version number', () => {
    // Arrange
    const bytes = buildPtb();

    // Act
    const detected = detectFormat(bytes);

    // Assert
    expect(detected).toEqual({ format: 'ptb', version: '4' });
  });

  it('detects every Power Tab fixture', () => {
    for (const name of POWER_TAB_FILES) {
      expect(detectFormat(loadFixture('powertab', name))?.format, name).toBe('ptb');
    }
  });

  it('does not take a "ptab" too short to hold a version for a Power Tab file', () => {
    expect(detectFormat(new TextEncoder().encode('ptab4'))).toBeUndefined();
  });

  it('rejects other Power Tab versions than 4 with an unsupported-format error', () => {
    // Arrange
    const bytes = buildPtb({ version: 3 });

    // Act
    const read = (): Song => readSong(bytes);

    // Assert
    expect(read).toThrow(UnsupportedFormatError);
    expect(read).toThrow('Power Tab file version 3 is not supported');
  });
});

describe('Power Tab fixture sweep', () => {
  it('has fixtures', () => {
    expect(POWER_TAB_FILES.length).toBeGreaterThan(0);
  });

  it.each(POWER_TAB_FILES)('reads %s and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('powertab', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source).toEqual({ format: 'ptb', version: '4' });
    assertSongInvariants(song);
  });
});

describe('Power Tab real files', () => {
  it('reads notes.ptb: song information, the guitar and bass tracks and the first beats', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'notes.ptb'));

    // Assert
    expect(song.info).toMatchObject({
      title: 'Some Title',
      artist: 'Some Artist',
      album: 'Some Live Video',
      music: 'Some Author',
      words: 'Some Lyricist',
      transcriber: 'Some Transcriber',
      copyright: '2001',
      instructions: 'Some notes.',
    });
    expect(song.tracks.map((track) => track.strings.map((s) => s.tuning))).toEqual([
      [64, 59, 55, 50, 45, 40],
      [43, 38, 33, 28],
    ]);
    expect(song.channels.map((channel) => [channel.program, channel.volume, channel.balance])).toEqual([
      [24, 104, 64],
      [33, 104, 64],
    ]);
    expect(song.tracks[1]?.measures[0]?.clef).toBe('bass');
    const beats = beatsOf(song);
    expect(beats.map((beat) => beat.start)).toEqual([960, 1440]);
    expect(beats.map((beat) => beat.voices[0]?.notes.map((note) => [note.string, note.fret]))).toEqual([[[4, 3]], [[4, 5]]]);
    expect(beats[0]?.voices[0]?.duration.value).toBe(8);
  });

  it('reads guitar_ins.ptb: each Guitar In gives its staff a track', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'guitar_ins.ptb'));

    // Assert
    expect(song.tracks.map((track) => track.name)).toEqual(['Guitar 1', 'Guitar 1', 'Guitar 3', 'Guitar 2', 'Guitar 1', 'Bass 1']);
    expect(song.measureHeaders).toHaveLength(4);
  });

  it('reads tempo_markers.ptb: the second measure changes the tempo', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'tempo_markers.ptb'));

    // Assert
    expect(song.measureHeaders.map((header) => header.tempo)).toEqual([120, 99]);
  });

  it('reads merge_multibar_rests.ptb: a six-bar rest leaves six empty measures', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'merge_multibar_rests.ptb'));

    // Assert
    expect(song.measureHeaders).toHaveLength(9);
    expect(song.tracks[0]?.measures.map((measure) => measure.beats.length)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('reads positions.ptb: a double-dotted half with vibrato and an arpeggio, then an eighth rest', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'positions.ptb'));

    // Assert
    const [first, second] = beatsOf(song);
    expect(first?.voices[0]?.duration).toMatchObject({ value: 2, doubleDotted: true });
    expect(first?.voices[0]?.notes[0]?.effect.vibrato).toBe(true);
    expect(first?.stroke).toEqual({ direction: 'up', value: 16 });
    expect(second).toMatchObject({ start: 960 + 3360 });
    expect(second?.voices[0]?.notes).toEqual([]);
  });

  it('reads bends.ptb: a bend and a tied bend', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'bends.ptb'));

    // Assert
    const notes = beatsOf(song).map((beat) => beat.voices[0]?.notes[0]);
    expect(notes.map((note) => note?.effect.bend !== undefined)).toEqual([true, true]);
    expect(notes[1]?.isTied).toBe(true);
  });

  it('gives a file whose scores hold no beats one measure (song_header.ptb)', () => {
    // Act
    const song = readSong(loadFixture('powertab', 'song_header.ptb'));

    // Assert
    expect(song.measureHeaders).toHaveLength(1);
    expect(song.tracks.length).toBeGreaterThan(0);
  });
});

describe('Power Tab song information', () => {
  it('maps the credits and joins the transcribers and the instructions', () => {
    // Act
    const info = readInfo({
      title: 'Title',
      artist: 'Band',
      album: 'Record',
      author: 'Composer',
      lyricist: 'Poet',
      arranger: 'Arranger',
      guitarTranscriber: 'Guitar tab',
      bassTranscriber: 'Bass tab',
      copyright: '(c) 2001',
      lyrics: 'la la',
      guitarInstructions: 'Palm mute',
      bassInstructions: 'Fingers',
    });

    // Assert
    expect(info).toEqual({
      title: 'Title',
      subtitle: '',
      artist: 'Band',
      album: 'Record',
      words: 'Poet',
      music: 'Composer',
      copyright: '(c) 2001',
      transcriber: 'Guitar tab - Bass tab',
      instructions: 'Palm mute\nFingers',
      notice: [],
    });
  });

  it.each([1, 2])('reads the album of release type %i', (releaseType) => {
    expect(readInfo({ releaseType, album: 'Live', title: 'T' })).toMatchObject({ album: 'Live', title: 'T' });
  });

  it('reads no album for an unknown release type, and no author when it is unknown', () => {
    // Act
    const info = readInfo({ releaseType: 7, isAuthorKnown: false, album: 'Ignored', copyright: 'C' });

    // Assert
    expect(info).toMatchObject({ album: '', music: '', words: '', copyright: 'C' });
  });

  it('uses the arranger when no transcriber is named, and one transcriber alone', () => {
    expect(readInfo({ arranger: 'Arranger' }).transcriber).toBe('Arranger');
    expect(readInfo({ bassTranscriber: 'Bass tab' }).transcriber).toBe('Bass tab');
  });

  it('reads a lesson: title, album, author, instructions and copyright', () => {
    // Act
    const info = readInfo({ classification: 1, title: 'Lesson', album: 'Book', author: 'Teacher', instructions: 'Slowly', copyright: 'C' });

    // Assert
    expect(info).toMatchObject({ title: 'Lesson', album: 'Book', music: 'Teacher', instructions: 'Slowly', copyright: 'C' });
  });

  it('reads no information for an unknown classification', () => {
    expect(readInfo({ classification: 2, title: 'Ignored' }).title).toBe('');
  });

  it('reads a string longer than 254 bytes through its 16-bit length', () => {
    // Arrange
    const long = 'x'.repeat(300);

    // Act
    const info = readInfo({ title: long });

    // Assert
    expect(info.title).toBe(long);
  });
});

describe('Power Tab errors', () => {
  const ONE_BEAT: PtbSongSpec = {
    guitarScore: {
      guitars: [{ number: 0 }],
      guitarIns: [{ section: 0, staff: 0, position: 0, guitars: 1 }],
      sections: [{ staffs: [{ voices: [[{ position: 0, notes: [{ string: 1, fret: 0 }] }]] }] }],
    },
  };

  it('rejects an object array whose class schema is not 1', () => {
    expect(() => readSong(buildPtb({ ...ONE_BEAT, schema: 2 }))).toThrow('Unsupported Power Tab object schema 2');
  });

  it('rejects a file cut short', () => {
    // Arrange
    const bytes = buildPtb(ONE_BEAT);

    // Act
    const read = (): Song => readSong(bytes.subarray(0, bytes.length - 40));

    // Assert
    expect(read).toThrow(UnexpectedEndOfFileError);
  });

  it('rejects a beat with a duration that is not a note value', () => {
    // Arrange
    const spec: PtbSongSpec = {
      guitarScore: { ...ONE_BEAT.guitarScore, sections: [{ staffs: [{ voices: [[{ position: 0, duration: 3 }]] }] }] },
    };

    // Act
    const read = (): Song => readSong(buildPtb(spec));

    // Assert
    expect(read).toThrow(GpFormatError);
    expect(read).toThrow('Unsupported Power Tab duration 3');
  });

  it('rejects a guitar without strings once a staff needs it', () => {
    // Arrange
    const spec: PtbSongSpec = { guitarScore: { ...ONE_BEAT.guitarScore, guitars: [{ number: 0, name: 'Broken', tuning: [] }] } };

    // Act
    const read = (): Song => readSong(buildPtb(spec));

    // Assert
    expect(read).toThrow('Power Tab guitar "Broken" has 0 strings');
  });

  it('rejects a multi-bar rest so long the song would pass the measure limit', () => {
    // Arrange
    const spec: PtbSongSpec = {
      guitarScore: {
        ...ONE_BEAT.guitarScore,
        sections: [
          {
            bars: [{ position: 1 }],
            staffs: [{ voices: [[{ position: 0, duration: 1, multiBarRest: 65535 }, { position: 2, notes: [{ string: 1, fret: 0 }] }]] }],
          },
        ],
      },
    };

    // Act
    const read = (): Song => readSong(buildPtb(spec));

    // Assert
    expect(read).toThrow('The song is longer than 4096 measures');
  });
});
