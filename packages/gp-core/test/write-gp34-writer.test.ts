import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/formats/detect';
import { plainDuration } from '../src/model/defaults';
import type { Note, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { ByteWriter } from '../src/write/byte-writer';
import { writeMeasureGp34 } from '../src/write/gp34-beats';
import { GP3_DIALECT } from '../src/write/gp3-dialect';
import { GP4_DIALECT } from '../src/write/gp4-dialect';
import { type WritableFormat, writeSong } from '../src/write/index';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { firstByteDifference, songDifference } from './helpers/write-compare';
import { expectedAfterGp34 } from './helpers/write-expected';
import { buildNote, buildSong, buildVoice, restVoice, songWithNotes } from './helpers/write-song-builder';

function roundTrip(song: Song, format: WritableFormat): Song {
  return readSong(writeSong(song, format));
}

/** The song with every measure emptied. */
function withoutBeats(song: Song): Song {
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, measures: track.measures.map((m) => ({ ...m, beats: [] })) })) };
}

function notesOf(song: Song, measure = 0): readonly Note[] {
  return song.tracks[0]?.measures[measure]?.beats.flatMap((beat) => beat.voices[0]?.notes ?? []) ?? [];
}

/** Fixtures whose model GP4 / GP3 hold completely (GP1/GP2: but for the channel rules GP5 shares). */
const LOSSLESS: Readonly<Record<'gp4' | 'gp3', readonly FixtureFolder[]>> = {
  gp4: ['guitarpro1', 'guitarpro2', 'guitarpro3', 'guitarpro4'],
  gp3: ['guitarpro1', 'guitarpro2', 'guitarpro3'],
};
const ALL_FOLDERS: readonly FixtureFolder[] = [
  'guitarpro1',
  'guitarpro2',
  'guitarpro3',
  'guitarpro4',
  'guitarpro5',
  'guitarpro6',
  'guitarpro7',
  'guitarpro8',
];

describe.each(['gp4', 'gp3'] as const)('writeSong(…, %s)', (format) => {
  it('starts with the version block the readers detect', () => {
    // Arrange / Act
    const detected = detectFormat(writeSong(songWithNotes([buildNote(1, 0)]), format));

    // Assert
    expect(detected).toEqual({ format, version: format === 'gp4' ? 'FICHIER GUITAR PRO v4.06' : 'FICHIER GUITAR PRO v3.00' });
  });

  describe.each(LOSSLESS[format])('round trip of %s fixtures', (folder) => {
    it.each(listFixtures(folder))('%s reads back unchanged', (name) => {
      // Arrange
      const song = readSong(loadFixture(folder, name));

      // Act
      const again = roundTrip(song, format);

      // Assert
      expect(again.source.format).toBe(format);
      expect(songDifference(expectedAfterGp34(song, again), again)).toBeUndefined();
    });
  });

  describe.each(ALL_FOLDERS)('fixed point of %s fixtures', (folder) => {
    it.each(listFixtures(folder))('%s reads back the same once written', (name) => {
      // Arrange
      const once = roundTrip(readSong(loadFixture(folder, name)), format);

      // Act
      const twice = roundTrip(once, format);

      // Assert
      assertSongInvariants(once);
      expect(songDifference(once, twice)).toBeUndefined();
    });
  });
});

// Guitar Pro leaves memory garbage after the version string; everything else matches byte for byte.
const BYTE_IDENTICAL: readonly (readonly [FixtureFolder, string, WritableFormat])[] = [
  ...['accentuations', 'bends', 'dead', 'grace', 'hammer', 'notes', 'tuplets'].map((name) => ['guitarpro3', `${name}.gp3`, 'gp3'] as const),
  ...['accentuations', 'dead', 'grace', 'notes', 'ranges', 'strings', 'strokes', 'trills'].map(
    (name) => ['guitarpro4', `${name}.gp4`, 'gp4'] as const,
  ),
];

describe('GP4 and GP3 bytes', () => {
  it.each(BYTE_IDENTICAL)('writes %s/%s byte for byte as Guitar Pro did', (folder, name, format) => {
    // Arrange
    const original = loadFixture(folder, name);

    // Act
    const written = writeSong(readSong(original), format);

    // Assert
    expect(firstByteDifference(written, original)).toBe(-1);
  });
});

describe('GP4 and GP3 song data', () => {
  it.each(['gp4', 'gp3'] as const)('%s round-trips headers, tracks and two-beat measures', (format) => {
    // Arrange
    const song = buildSong({
      info: { title: 'Title', words: 'Author', music: 'Author', notice: ['n1', 'n2'] },
      headers: [
        { repeatOpen: true, marker: { title: 'A', color: { r: 9, g: 8, b: 7 } }, tripletFeel: 'eighth' },
        { repeatClose: 2, repeatAlternative: 0b001, tripletFeel: 'eighth' },
        { repeatAlternative: 0b010, timeSignature: { numerator: 3, denominator: 8 }, tempo: 90, tripletFeel: 'eighth' },
        { repeatAlternative: 0b100, repeatClose: 1, tripletFeel: 'eighth' },
      ],
      tracks: [
        {
          keySignatures: [1, 1, -2, -2],
          measures: [
            [{ voice: buildVoice([buildNote(1, 3), buildNote(2, 5, { velocity: 47 })]), text: 'go' }, { voice: restVoice() }],
            [{ voice: buildVoice([buildNote(3, 0)], plainDuration(2)), stroke: { direction: 'down', value: 16 } }],
            [{ voice: buildVoice([buildNote(4, 2)], { ...plainDuration(4), dotted: true }) }],
            [{ voice: buildVoice([buildNote(5, 2)], { ...plainDuration(8), tuplet: { enters: 3, times: 2 } }) }],
          ],
          offset: 2,
          color: { r: 1, g: 2, b: 3 },
        },
        { isPercussion: true, measures: [[{ voice: buildVoice([buildNote(1, 38)]) }]] },
      ],
    });

    // Act / Assert (the drum track's empty measures read back as a quarter rest)
    expect(songDifference(expectedAfterGp34(song), roundTrip(song, format))).toBeUndefined();
  });

  it('writes GP4 lyrics, chords, pick strokes and the GP4 note effects', () => {
    // Arrange
    const chord = { name: 'D', firstFret: 2, frets: [2, 3, 2, 0, -1, -1] };
    const song = buildSong({
      tracks: [
        {
          lyrics: { from: 1, text: 'words' },
          measures: [
            [
              { voice: buildVoice([buildNote(1, 2, { effect: { slides: ['intoFromAbove'], staccato: true, accentuatedNote: true } })]), chord },
              { voice: buildVoice([buildNote(1, 5, { effect: { trill: { fret: 7, duration: plainDuration(16) }, palmMute: true } })]), pickStroke: 'up' },
              { voice: buildVoice([buildNote(2, 5, { effect: { tremoloPicking: { duration: plainDuration(32) }, vibrato: true } })]) },
              { voice: buildVoice([buildNote(2, 5, { effect: { grace: { fret: 3, duration: 2, velocity: 95, transition: 'bend', onBeat: false, isDead: false } } })]) },
            ],
          ],
        },
      ],
    });

    // Act / Assert
    expect(songDifference(song, roundTrip(song, 'gp4'))).toBeUndefined();
  });

  it('writes GP4 harmonics with their GP4 codes', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 12 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 19 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 24 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'tapped', data: 17 } } }), buildNote(2, 7, { effect: { harmonic: { type: 'natural', data: 0 } } })],
    );

    // Act / Assert
    expect(songDifference(song, roundTrip(song, 'gp4'))).toBeUndefined();
  });

  it('writes the GP3 beat effects: vibrato, harmonics, fade in, slapping and a tremolo bar dive', () => {
    // Arrange
    const dive = { points: [{ position: 0, value: 0 }, { position: 6, value: -4 }, { position: 12, value: 0 }] };
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { vibrato: true, fadeIn: true } }), buildNote(2, 5, { effect: { vibrato: true, fadeIn: true } })],
      [buildNote(1, 12, { effect: { harmonic: { type: 'natural', data: 0 } } })],
      [buildNote(1, 5, { effect: { harmonic: { type: 'artificial', data: 12 } } })],
      [buildNote(1, 5, { effect: { slapping: true } })],
      [buildNote(1, 5, { effect: { tremoloBar: dive } })],
      [buildNote(1, 5, { effect: { hammer: true, letRing: true, slides: ['shift'], ghostNote: true } })],
    );

    // Act / Assert
    expect(songDifference(song, roundTrip(song, 'gp3'))).toBeUndefined();
  });
});

/** Offset of the song's key signature (an int after the texts, triplet feel and tempo) in a GP3/GP4 file. */
function songKeyOffset(bytes: Uint8Array, format: 'gp3' | 'gp4'): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const skipString = (offset: number): number => offset + 4 + view.getInt32(offset, true);
  let offset = VERSION_BLOCK_SIZE;
  for (let i = 0; i < INFO_STRING_COUNT; i++) {
    offset = skipString(offset);
  }
  const noticeLines = view.getInt32(offset, true);
  offset += 4;
  for (let i = 0; i < noticeLines; i++) {
    offset = skipString(offset);
  }
  offset += 1; // triplet feel
  if (format === 'gp4') {
    offset += 8; // lyric track and first measure
    offset = skipString(offset);
    for (let i = 0; i < 4; i++) {
      offset = skipString(offset + 4);
    }
  }
  return offset + 4; // after the tempo
}

const VERSION_BLOCK_SIZE = 31;
const INFO_STRING_COUNT = 8;

describe('GP4 and GP3 files other readers open', () => {
  it.each([
    ['gp4', GP4_DIALECT],
    ['gp3', GP3_DIALECT],
  ] as const)('writes a %s measure without beats as Guitar Pro does: one empty quarter beat', (_format, dialect) => {
    // Arrange
    const writer = new ByteWriter();

    // Act
    writeMeasureGp34(writer, [], { dialect, stringCount: 6, keptTies: new Set<Note>() });

    // Assert: one beat; flags 0x40 (status follows), status 0x00 (empty), a quarter, no string
    expect([...writer.toBytes()]).toEqual([1, 0, 0, 0, 0x40, 0x00, 0x00, 0x00]);
  });

  it.each(['gp4', 'gp3'] as const)('reads an empty %s measure back as the quarter rest TuxGuitar makes of an empty beat', (format) => {
    // Arrange
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 3)]) }], []] }] });

    // Act
    const again = roundTrip(song, format);

    // Assert
    const beats = again.tracks[0]?.measures[1]?.beats ?? [];
    expect(beats.map((beat) => [beat.voices[0]?.duration.value, beat.voices[0]?.notes.length, beat.voices[0]?.isEmpty])).toEqual([[4, 0, false]]);
    expect(songDifference(expectedAfterGp34(song), again)).toBeUndefined();
  });

  it.each(['gp4', 'gp3'] as const)('keeps the key in %s measure 1 for readers that skip the song key', (format) => {
    // Arrange
    const song = buildSong({ tracks: [{ keySignatures: [2, 2], measures: [[{ voice: buildVoice([buildNote(1, 3)]) }], [{ voice: restVoice() }]] }] });
    const bytes = writeSong(song, format);

    // Act: zero the song's key, as a reader that never looks at it sees the file
    const withoutSongKey = new Uint8Array(bytes);
    new DataView(withoutSongKey.buffer).setInt32(songKeyOffset(bytes, format), 0, true);
    const again = readSong(withoutSongKey);

    // Assert
    expect(again.tracks[0]?.measures.map((measure) => measure.keySignature)).toEqual([2, 2]);
  });
});

describe('GP4 and GP3 vibrato', () => {
  it.each(['gp3', 'gp4'] as const)('writes %s slight and wide vibrato, wide as the beat’s wide-vibrato bit', (format) => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { vibrato: true } }), buildNote(2, 5, { effect: { vibrato: true } })],
      [buildNote(1, 5, { effect: { wideVibrato: true } }), buildNote(2, 5, { effect: { wideVibrato: true } })],
      [buildNote(1, 5)],
    );

    // Act
    const again = roundTrip(song, format);

    // Assert
    expect(songDifference(song, again)).toBeUndefined();
  });

  it('keeps GP3 vibrato per beat, wide over slight', () => {
    // Arrange
    const song = songWithNotes(
      [buildNote(1, 5, { effect: { vibrato: true } }), buildNote(2, 5)],
      [buildNote(1, 5, { effect: { vibrato: true } }), buildNote(2, 5, { effect: { wideVibrato: true } })],
    );

    // Act
    const notes = notesOf(roundTrip(song, 'gp3'));

    // Assert
    expect(notes.map((note) => [note.effect.vibrato, note.effect.wideVibrato])).toEqual([
      [true, false],
      [true, false],
      [false, true],
      [false, true],
    ]);
  });
});

describe('GP4 and GP3 losses', () => {
  it('joins the second voice into the first, as TuxGuitar does', () => {
    // Arrange
    const song = buildSong({
      tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 1)]), voice2: buildVoice([buildNote(5, 3)]) }]] }],
    });

    // Act
    const again = roundTrip(song, 'gp4');

    // Assert
    expect(notesOf(again).map((note) => [note.string, note.fret])).toEqual([
      [1, 1],
      [5, 3],
    ]);
    expect(again.tracks[0]?.measures[0]?.beats[0]?.voices[1]?.isEmpty).toBe(true);
  });

  it('keeps one triplet feel for the song and the alternate endings Guitar Pro 3/4 can number', () => {
    // Arrange
    const song = buildSong({
      headers: [{ tripletFeel: 'eighth', repeatOpen: true }, { tripletFeel: 'none', repeatAlternative: 0b100 }],
      tracks: [{ measures: [] }],
    });

    // Act
    const again = roundTrip(song, 'gp4');

    // Assert
    expect(again.measureHeaders.map((header) => header.tripletFeel)).toEqual(['eighth', 'eighth']);
    expect(again.measureHeaders[1]?.repeatAlternative).toBe(0b111);
  });

  it.each([
    ['gp4', 21],
    ['gp3', 22],
  ] as const)('cuts %s chord names to the %i bytes the format holds', (format, size) => {
    // Arrange
    const name = 'Cmaj7(add9,#11)/G over E';
    const song = buildSong({ tracks: [{ measures: [[{ voice: buildVoice([buildNote(1, 0)]), chord: { name, firstFret: 1, frets: [0, 0, 0, 0, 0, 0] } }]] }] });

    // Act
    const chord = roundTrip(song, format).tracks[0]?.measures[0]?.beats[0]?.chord;

    // Assert
    expect(chord?.name).toBe(name.slice(0, size));
  });

  it('keeps the words as the single GP3/GP4 author, and no solo, mute or heavy accent', () => {
    // Arrange
    const song = buildSong({
      info: { words: 'Lyricist', music: 'Composer' },
      tracks: [{ solo: true, mute: true, measures: [[{ voice: buildVoice([buildNote(1, 1, { effect: { heavyAccentuatedNote: true } })]) }]] }],
    });

    // Act
    const again = roundTrip(song, 'gp4');

    // Assert
    expect([again.info.words, again.info.music]).toEqual(['Lyricist', 'Lyricist']);
    expect([again.tracks[0]?.solo, again.tracks[0]?.mute]).toEqual([false, false]);
    expect(notesOf(again)[0]?.effect.heavyAccentuatedNote).toBe(false);
  });

  it('writes the tempo change into the first track that has a beat in the measure (none: lost)', () => {
    // Arrange
    const song = buildSong({
      headers: [{ tempo: 100 }, { tempo: 80 }],
      tracks: [{ measures: [[{ voice: restVoice() }]] }, { measures: [[{ voice: restVoice() }], [{ voice: restVoice() }]] }],
    });

    // Act / Assert
    expect(roundTrip(song, 'gp3').measureHeaders.map((header) => header.tempo)).toEqual([100, 80]);
    expect(roundTrip(withoutBeats(song), 'gp4').measureHeaders.map((header) => header.tempo)).toEqual([100, 100]);
  });
});
