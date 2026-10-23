import { describe, expect, it } from 'vitest';
import { durationTicks } from '../src/model/defaults';
import type { Song, Track } from '../src/model/song';
import { readSong } from '../src/read-song';
import { encodeMusicXml, writeMusicXmlArchive } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';

const GP_FOLDERS: readonly FixtureFolder[] = ['guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6', 'guitarpro7', 'guitarpro8'];
/** The largest fixtures write several megabytes of XML; reading them back takes seconds under coverage. */
const ROUND_TRIP_TIMEOUT = 60_000;

/** A track's notes as text, measure by measure: position, voice, string (not for drums), fret, tie, velocity, length. */
function trackNotes(track: Track): readonly (readonly string[])[] {
  return track.measures.map((measure) =>
    measure.beats.flatMap((beat) =>
      beat.voices.flatMap((voice, voiceIndex) =>
        voice.notes.map((note) =>
          [beat.start, voiceIndex, track.isPercussion ? '-' : note.string, note.fret, note.isTied, note.velocity, durationTicks(voice.duration)].join('|'),
        ),
      ),
    ).sort(),
  );
}

/**
 * What a MusicXML round trip keeps: measures, meters, tempos, repeats, tunings, and every note's place and length. Drum
 * tracks have no tab staff: their notes keep their keys (frets) but not their strings, and their strings no tuning.
 */
function roundTripSummary(song: Song) {
  return {
    headers: song.measureHeaders.map((header) => ({
      start: header.start,
      timeSignature: header.timeSignature,
      tempo: header.tempo,
      repeatOpen: header.repeatOpen,
      repeatClose: header.repeatClose,
      repeatAlternative: header.repeatAlternative,
      marker: header.marker?.title.trim(),
    })),
    tracks: song.tracks.map((track) => ({
      strings: track.isPercussion ? [] : track.strings.map((guitarString) => guitarString.tuning),
      offset: track.offset,
      isPercussion: track.isPercussion,
      keys: track.isPercussion ? [] : track.measures.map((measure) => measure.keySignature),
      notes: trackNotes(track),
    })),
  };
}

describe.each(GP_FOLDERS)('MusicXML round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))(
    '%s keeps measures, meters, tempos, tunings, strings, frets and durations',
    (name) => {
      // Arrange
      const song = readSong(loadFixture(folder, name));

      // Act
      const again = readSong(encodeMusicXml(writeMusicXml(song)));

      // Assert
      assertSongInvariants(again);
      expect(again.source.format).toBe('musicxml');
      expect(roundTripSummary(again)).toEqual(roundTripSummary(song));
    },
    ROUND_TRIP_TIMEOUT,
  );
});

describe('compressed MusicXML round trip', () => {
  it('reads back what writeMusicXmlArchive writes', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', 'effects.gp5'));

    // Act
    const again = readSong(writeMusicXmlArchive(song));

    // Assert
    expect(roundTripSummary(again)).toEqual(roundTripSummary(song));
  });
});
