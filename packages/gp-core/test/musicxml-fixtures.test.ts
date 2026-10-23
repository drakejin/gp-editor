import { describe, expect, it } from 'vitest';
import { durationTicks } from '../src/model/defaults';
import type { Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { encodeMusicXml } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { fromTux } from './helpers/ticks';
import { beatsOf, voiceNotes } from './helpers/musicxml-snippets';

function read(name: string): Song {
  return readSong(loadFixture('musicxml', name));
}

/** Each measure's notes of every track as "string/fret" per beat and voice. */
function notesText(song: Song): string {
  return song.tracks
    .map((track) => track.measures.map((measure) => measure.beats.map((beat) => beat.voices.map((voice) => voice.notes.map((note) => `${note.string}/${note.fret}`).join(',')).join(';')).join(' ')).join(' | '))
    .join(' || ');
}

describe('MusicXML test suite files', () => {
  it.each(listFixtures('musicxml'))('%s reads into a valid song', (name) => {
    // Arrange / Act
    const song = read(name);

    // Assert
    assertSongInvariants(song);
    expect(song.source.format).toBe('musicxml');
  });

  it.each(listFixtures('musicxml'))('%s is a fixed point once written as MusicXML', (name) => {
    // Arrange
    const song = read(name);

    // Act
    const again = readSong(encodeMusicXml(writeMusicXml(song)));

    // Assert
    expect(again.measureHeaders).toEqual(song.measureHeaders);
    expect(notesText(again)).toBe(notesText(song));
  });
});

describe('MusicXML test suite values', () => {
  it('71e-TabStaves: every part keeps the tuning of its tab staff and each note its string and fret', () => {
    // Arrange / Act
    const song = read('71e-TabStaves.xml');

    // Assert
    expect(song.tracks.map((track) => track.strings.map((s) => s.tuning))).toEqual([
      [64, 59, 55, 50, 45, 40],
      [64, 59, 55, 50, 45, 40],
      [64, 57, 54, 50, 45, 38],
      [62, 59, 55, 50, 45, 38],
      [43, 38, 33, 28],
      [62, 60, 55, 50, 67],
      [67, 62, 57, 53, 48, 43],
      [67, 60, 64, 69],
    ]);
    expect(voiceNotes(song).map((notes) => notes.map((note) => [note.string, note.fret]))).toEqual([[[4, 5]], [[2, 17]], [[2, 1]], [[4, 2]]]);
  });

  it('45a and 45b: a repeat played five times, and first and second endings', () => {
    // Arrange / Act
    const simple = read('45a-SimpleRepeat.xml').measureHeaders;
    const endings = read('45b-RepeatWithAlternatives.xml').measureHeaders;

    // Assert
    expect(simple[0]?.repeatClose).toBe(4);
    expect(endings.map((header) => [header.repeatClose, header.repeatAlternative])).toEqual([
      [0, 0],
      [1, 1],
      [0, 2],
      [0, 0],
    ]);
  });

  it('61a-Lyrics: syllables joined into words, a note without a syllable left blank', () => {
    // Arrange / Act
    const lyrics = read('61a-Lyrics.xml').tracks[0]?.lyrics;

    // Assert
    expect(lyrics).toEqual({ from: 1, text: 'Tra- la- li Ja!  Tra-  ra!  Bah!' });
  });

  it('23a-Tuplets: triplets and other tuplets keep their place in a 14/4 measure', () => {
    // Arrange / Act
    const song = read('23a-Tuplets.xml');

    // Assert
    expect(song.measureHeaders[0]?.timeSignature).toEqual({ numerator: 14, denominator: 4 });
    const beats = beatsOf(song);
    expect(beats.slice(0, 3).map((beat) => beat.voices[0]?.duration.tuplet)).toEqual([
      { enters: 3, times: 2 },
      { enters: 3, times: 2 },
      { enters: 3, times: 2 },
    ]);
    const last = beats[beats.length - 1];
    expect((last?.start ?? 0) + durationTicks(last?.voices[0]?.duration ?? { value: 1, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } })).toBe(fromTux(960 + 14 * 960));
  });

  it('43a-PianoStaff: the two staves become two voices', () => {
    // Arrange / Act
    const song = read('43a-PianoStaff.xml');

    // Assert
    const [beat] = beatsOf(song);
    expect(beat?.voices.map((voice) => voice.notes.length)).toEqual([1, 1]);
  });

  it('90a-Compressed-MusicXML: reads the score named by container.xml', () => {
    // Arrange / Act
    const song = read('90a-Compressed-MusicXML.mxl');

    // Assert
    expect(song.tracks[0]?.name).toBe('Voice');
    expect(beatsOf(song).length).toBeGreaterThan(0);
  });
});
