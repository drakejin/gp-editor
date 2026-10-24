import { describe, expect, it } from 'vitest';
import { renderMidi } from '../src/midi';
import type { Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { encodeMusicXml } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { assertEditInvariants, buildSong, n, play, rest, voiceLayout } from './helpers/edit-songs';
import { playedNotes, readMidi } from './helpers/midi-reader';
import { firstDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';

/** One bar of 4/4 in four voices: a melody, a bass, an inner voice from beat 2 and a low pedal from beat 3. */
function fourVoices(): Song {
  return buildSong({
    tracks: [
      [
        [
          [play(4, n(1, 5)), play(4, n(1, 7)), play(2, n(1, 8))],
          [play(2, n(6, 0)), play(2, n(6, 3))],
          [rest(4), play(4, n(3, 2)), play(2, n(3, 4))],
          [rest(2), play(2, n(5, 2))],
        ],
      ],
    ],
  });
}

const layouts = (song: Song): string[][] => [0, 1, 2, 3].map((voiceIndex) => voiceLayout(song, 0, 0, voiceIndex));

describe('a song in four voices', () => {
  it('is a valid edit song', () => {
    assertEditInvariants(fourVoices());
    expect(layouts(fourVoices())[3]).toEqual(['0:2:r', '1920:2:5/2']);
  });

  it('keeps all four voices in a Guitar Pro 7/8 file', () => {
    // Arrange
    const song = fourVoices();

    // Act
    const again = readSong(writeSong(song, 'gp'));

    // Assert
    expect(layouts(again)).toEqual(layouts(song));
  });

  it('keeps voices 1 and 2 in a GP5 file and leaves voices 3 and 4 out, as the expected list says', () => {
    // Arrange
    const song = fourVoices();

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    expect(layouts(again)).toEqual([layouts(song)[0], layouts(song)[1], [], []]);
    expect(firstDifference(expectedAfterGp5(song, again).tracks[0]?.measures, again.tracks[0]?.measures)).toBeUndefined();
  });

  it.each(['gp4', 'gp3'] as const)('joins voices 2, 3 and 4 into voice 1 in a %s file, as TuxGuitar does', (format) => {
    // Arrange
    const song = fourVoices();

    // Act
    const again = readSong(writeSong(song, format));

    // Assert
    const notesOf = (voiceIndex: number) =>
      again.tracks[0]?.measures[0]?.beats.flatMap((beat) => beat.voices[voiceIndex]?.notes.map((note) => `${note.string}/${note.fret}`) ?? []) ?? [];
    expect(notesOf(0)).toEqual(['1/5', '6/0', '1/7', '3/2', '1/8', '3/4', '5/2', '6/3']);
    expect([1, 2, 3].flatMap(notesOf)).toEqual([]);
  });

  it('writes voices 3 and 4 to MusicXML, which reads them back', () => {
    // Arrange
    const song = fourVoices();

    // Act
    const text = writeMusicXml(song);
    const again = readSong(encodeMusicXml(text));

    // Assert
    expect(text).toContain('<voice>3</voice>');
    expect(text).toContain('<voice>4</voice>');
    expect(layouts(again)).toEqual(layouts(song));
  });

  it('plays the notes of all four voices', () => {
    // Arrange
    const song = fourVoices();

    // Act
    const keys = playedNotes(readMidi(renderMidi(song).bytes)).map((played) => played.key);

    // Assert: voice 3's D (55 + 2, 55 + 4) and voice 4's B (45 + 2) sound with voices 1 and 2
    expect(keys).toEqual(expect.arrayContaining([69, 71, 72, 40, 43, 57, 59, 47]));
    expect(keys).toHaveLength(8);
  });
});
