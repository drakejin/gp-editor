import { describe, expect, it } from 'vitest';
import { GpFormatError, readSong, UnsupportedFormatError } from '../src';
import { readGp1 as readGp1Direct } from '../src/formats/gtp/gp1';
import { readGp2 as readGp2Direct } from '../src/formats/gtp/gp2';
import type { Beat, Song } from '../src/model/song';
import { listFixtures, loadFixture } from './helpers/fixtures';
import {
  buildLegacyGtp,
  type LegacyBeatSpec,
  type LegacyMeasureSpec,
  type LegacySongSpec,
} from './helpers/gtp-legacy-builder';
import { assertSongInvariants } from './helpers/invariants';

const V220 = 'FICHIER GUITAR PRO v2.20';
const V221 = 'FICHIER GUITAR PRO v2.21';

const QUARTER_NOTE: LegacyBeatSpec = { duration: 0, notes: [{ bit: 5, fret: 0 }] };

function readGp2(spec: Omit<LegacySongSpec, 'version'> & { version?: string }): Song {
  return readSong(buildLegacyGtp({ version: V221, ...spec }));
}

function beatsOf(song: Song, track = 0, measure = 0): readonly Beat[] {
  return song.tracks[track]?.measures[measure]?.beats ?? [];
}

// Real .gtp files are not committed (no redistribution license): run test/fixtures/fetch-gtp.sh.
const HAS_REAL_FILES = listFixtures('guitarpro2').length > 0;

describe.skipIf(!HAS_REAL_FILES)('GP2 fixture sweep', () => {
  const files = listFixtures('guitarpro2');

  it('has fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('reads %s and passes the song invariants', (name) => {
    // Arrange
    const bytes = loadFixture('guitarpro2', name);

    // Act
    const song = readSong(bytes);

    // Assert
    expect(song.source.format).toBe('gp2');
    assertSongInvariants(song);
  });
});

describe.skipIf(!HAS_REAL_FILES)('GP2 real files', () => {
  it('reads "The Final Waltz": info, tracks, a four-string bass and mixer values', () => {
    // Act
    const song = readSong(loadFixture('guitarpro2', 'the-final-waltz.gtp'));

    // Assert
    expect(song.source).toEqual({ format: 'gp2', version: V221 });
    expect(song.info).toMatchObject({ title: 'The Final Waltz', music: 'Running Wild', words: 'Running Wild' });
    expect(song.tracks.map((track) => track.name).slice(0, 3)).toEqual(['Gtr1', 'Gtr2', 'Bass']);
    expect(song.tracks[2]?.strings.map((s) => s.tuning)).toEqual([43, 38, 33, 28]);
    expect(song.tracks[2]?.measures[0]?.clef).toBe('bass');
    expect(song.tracks[0]?.measures[0]?.clef).toBe('treble');
    expect(song.channels[1]).toMatchObject({ program: 24, volume: 102, balance: 64 });
    expect(song.channels.map((channel) => channel.name).slice(0, 3)).toEqual([
      'Clean Electric Guitar 1',
      'Nylon String Acoustic Guitar 1',
      'Acoustic Bass 1',
    ]);
    expect(song.measureHeaders).toHaveLength(46);
    const bass = beatsOf(song, 2, 1)[0]?.voices[0]?.notes[0];
    expect(bass).toMatchObject({ string: 3, fret: 0, velocity: 95 });
  });

  it('reads tempo changes from mix tables: the last change in a measure wins and carries on', () => {
    // Act
    const song = readSong(loadFixture('guitarpro2', 'the-final-waltz.gtp'));

    // Assert
    const tempos = song.measureHeaders.map((header) => header.tempo);
    expect(tempos[0]).toBe(148);
    expect(tempos[43]).toBe(148);
    expect(tempos[44]).toBe(90);
    expect(tempos[45]).toBe(70);
  });

  it('reads "So Fine": repeat sections, alternate endings and tempo changes', () => {
    // Act
    const song = readSong(loadFixture('guitarpro2', 'so-fine.gtp'));

    // Assert
    const headers = song.measureHeaders;
    expect(headers[8]?.repeatOpen).toBe(true);
    expect(headers[19]).toMatchObject({ repeatClose: 1, repeatAlternative: 1 });
    expect(headers[20]).toMatchObject({ repeatClose: 0, repeatAlternative: 2 });
    expect(headers[0]?.tempo).toBe(70);
    expect(headers[25]?.tempo).toBe(140);
    expect(headers[41]?.tempo).toBe(70);
  });

  it('reads "Pretty Woman": chords, beat texts and dynamics', () => {
    // Act
    const song = readSong(loadFixture('guitarpro2', 'pretty-woman.gtp'));

    // Assert
    expect(song.info).toMatchObject({ title: 'Pretty Woman', music: 'Roy Orbison' });
    const beat = beatsOf(song, 0, 8)[0];
    expect(beat?.chord).toEqual({ name: 'A', firstFret: 1, frets: [0, 2, 2, 2, 0, 0] });
    expect(beat?.text).toBe('Woman,');
    expect(beatsOf(song, 3, 8)[0]?.chord).toBeUndefined();
    expect(beatsOf(song, 0, 7)[6]?.text).toBe('Pretty');
    expect(song.tracks[0]?.measures[0]?.beats[0]?.voices[0]).toMatchObject({ notes: [], duration: { value: 1 } });
  });
});

describe('GP2 synthetic files', () => {
  it('reads both versions with eight tracks, key signature and track details', () => {
    // Arrange
    const tracks = [{ name: 'Lead', solo: true, volume: 90, balance: 10, chorus: 3, reverb: 4, offset: 5, program: 30 }];

    // Act
    const songs = [V220, V221].map((version) => readGp2({ version, keySignature: 2, tracks }));

    // Assert
    for (const song of songs) {
      expect(song.tracks).toHaveLength(8);
      expect(song.tracks[0]).toMatchObject({ name: 'Lead', solo: true, offset: 5 });
      expect(song.channels[0]).toMatchObject({ program: 30, volume: 90, balance: 10, chorus: 3, reverb: 4 });
      expect(song.tracks[0]?.measures[0]?.keySignature).toBe(2);
    }
    expect(songs[0]?.source.version).toBe(V220);
  });

  it('maps the dynamic byte to velocity 15 + 16 × (dynamic − 1)', () => {
    // Arrange
    const notes = [1, 4, 6, 8].map((dynamic, i) => ({ bit: 5 - i, fret: i, dynamic }));

    // Act
    const read = beatsOf(readGp2({ measures: [{ tracks: [[{ duration: -2, notes }]] }] }))[0]?.voices[0]?.notes;

    // Assert
    expect(read?.map((note) => note.velocity)).toEqual([15, 63, 95, 127]);
  });

  it('clamps velocities of out-of-range dynamics to 0…127', () => {
    // Arrange
    const notes = [0, 9].map((dynamic, i) => ({ bit: 5 - i, fret: 0, dynamic }));

    // Act
    const read = beatsOf(readGp2({ measures: [{ tracks: [[{ duration: -2, notes }]] }] }))[0]?.voices[0]?.notes;

    // Assert
    expect(read?.map((note) => note.velocity)).toEqual([0, 127]);
  });

  it('skips grace notes, strokes and every mix-table field without losing sync', () => {
    // Arrange
    const beats: LegacyBeatSpec[] = [
      {
        duration: 0,
        stroke: [2, 4],
        mix: { reverb: true, chorus: true, balance: true, volume: true, instrument: true },
        notes: [{ bit: 5, fret: 3, grace: true }, { bit: 4, fret: 5 }],
      },
      { duration: 0, notes: [{ bit: 0, fret: 7, grace: true, effect: 1 }] },
      { duration: -1, notes: [{ bit: 2, fret: 9 }] },
    ];

    // Act
    const song = readGp2({ measures: [{ tracks: [beats] }] });

    // Assert
    const read = beatsOf(song);
    expect(read.map((beat) => beat.voices[0]?.notes.map((note) => [note.string, note.fret]))).toEqual([
      [
        [1, 3],
        [2, 5],
      ],
      [[6, 7]],
      [[4, 9]],
    ]);
    expect(read[0]?.stroke).toEqual({ direction: 'none', value: 0 });
    expect(read[1]?.voices[0]?.notes[0]?.effect.grace).toBeUndefined();
    expect(read[1]?.voices[0]?.notes[0]?.effect.hammer).toBe(true);
    expect(song.measureHeaders[0]?.tempo).toBe(120);
  });

  it('applies a tempo change of any track to the measure and the measures after it', () => {
    // Arrange
    const measures: LegacyMeasureSpec[] = [
      { tracks: [[QUARTER_NOTE], [{ ...QUARTER_NOTE, mix: { tempo: 90 } }]] },
      { tracks: [[{ ...QUARTER_NOTE, mix: { tempo: 100 } }, { ...QUARTER_NOTE, mix: { tempo: 110 } }]] },
      {},
    ];

    // Act
    const song = readGp2({ tempo: 80, measures });

    // Assert
    expect(song.measureHeaders.map((header) => header.tempo)).toEqual([90, 110, 110]);
  });

  it('reads chords with the full layout and copies tied notes with their velocity', () => {
    // Arrange
    const beats: LegacyBeatSpec[] = [
      { duration: 0, chord: { name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] }, notes: [{ bit: 5, fret: 0, dynamic: 8 }] },
      { duration: 0, tied: true },
    ];

    // Act
    const read = beatsOf(readGp2({ measures: [{ tracks: [beats] }] }));

    // Assert
    expect(read[0]?.chord).toEqual({ name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] });
    expect(read[1]?.voices[0]?.notes).toEqual([
      expect.objectContaining({ string: 1, fret: 0, velocity: 127, isTied: true }),
    ]);
  });

  it('throws GpFormatError for a file cut inside a mix table', () => {
    // Arrange
    const bytes = buildLegacyGtp({ version: V221, measures: [{ tracks: [[{ ...QUARTER_NOTE, mix: { tempo: 90 } }]] }] });

    // Act / Assert
    expect(() => readSong(bytes.subarray(0, bytes.length - 8))).toThrow(GpFormatError);
  });
});

describe('GP1/GP2 version guards', () => {
  it('rejects a header string that is not a version of the format', () => {
    // Arrange
    const options = { charset: 'auto' } as const;
    const gp2Bytes = buildLegacyGtp({ version: V221 });

    // Act / Assert
    expect(() => readGp1Direct(gp2Bytes, { format: 'gp1', version: V221 }, options)).toThrow(UnsupportedFormatError);
    expect(() => readGp2Direct(gp2Bytes, { format: 'gp2', version: 'FICHIER GUITARE PRO v1.04' }, options)).toThrow(
      UnsupportedFormatError,
    );
  });
});
