/**
 * GP3–GP5 notation marks: GP5's musical directions and GP4/GP5's rasgueado flag, read from real files and written
 * back. What these formats cannot hold (hairpins, fade out, volume swell, pedals, the rasgueado's pattern) is listed in
 * write-expected.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Beat, MusicalDirection, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { loadFixture } from './helpers/fixtures';

/** directions.gp5 puts one direction on each of its 19 bars. */
const DIRECTIONS_GP5: readonly MusicalDirection[] = [
  'coda',
  'doubleCoda',
  'segno',
  'segnoSegno',
  'fine',
  'daCapo',
  'daCapoAlCoda',
  'daCapoAlDoubleCoda',
  'daCapoAlFine',
  'daSegno',
  'daSegnoSegno',
  'daSegnoAlCoda',
  'daSegnoAlDoubleCoda',
  'daSegnoSegnoAlCoda',
  'daSegnoSegnoAlDoubleCoda',
  'daSegnoAlFine',
  'daSegnoSegnoAlFine',
  'daCoda',
  'daDoubleCoda',
];

function firstBeat(song: Song): Beat {
  const beat = song.tracks[0]?.measures[0]?.beats[0];
  if (beat === undefined) {
    throw new Error('no first beat');
  }
  return beat;
}

function withFirstBeat(song: Song, change: (beat: Beat) => Beat): Song {
  return {
    ...song,
    tracks: song.tracks.map((track, t) =>
      t !== 0 ? track : { ...track, measures: track.measures.map((measure, m) => (m !== 0 ? measure : { ...measure, beats: measure.beats.map((beat, b) => (b === 0 ? change(beat) : beat)) })) },
    ),
  };
}

describe('GP5 musical directions', () => {
  it('reads the bar of each of the 19 directions of directions.gp5', () => {
    // Act
    const song = readSong(loadFixture('guitarpro5', 'directions.gp5'));

    // Assert
    expect(song.measureHeaders.map((header) => header.directions)).toEqual(DIRECTIONS_GP5.map((direction) => [direction]));
  });

  it('writes the directions of a GP8 file into GP5 and reads them back', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro8', 'directions.gp'));

    // Act
    const again = readSong(writeSong(song, 'gp5'));

    // Assert
    expect(again.measureHeaders.map((header) => header.directions)).toEqual(song.measureHeaders.map((header) => header.directions));
  });

  it('keeps only the first bar of a direction GP5 can place once', () => {
    // Arrange
    const song = readSong(loadFixture('guitarpro8', 'directions.gp'));
    const twice: Song = { ...song, measureHeaders: song.measureHeaders.map((header, index) => (index === 5 ? { ...header, directions: ['segno', 'daCapo'] } : header)) };

    // Act
    const again = readSong(writeSong(twice, 'gp5'));

    // Assert
    expect(again.measureHeaders[5]?.directions).toBeUndefined();
    expect(again.measureHeaders[0]?.directions).toContain('segno');
  });
});

describe('GP4 and GP5 rasgueado', () => {
  it.each(['gp5', 'gp4'] as const)('writes a rasgueado beat to %s and reads it back as Guitar Pro’s first pattern', (format) => {
    // Arrange
    const song = withFirstBeat(readSong(loadFixture('guitarpro5', 'strokes.gp5')), (beat) => ({ ...beat, rasgueado: 'amiAnapaest' }));

    // Act
    const again = readSong(writeSong(song, format));

    // Assert
    expect(firstBeat(again).rasgueado).toBe('ii');
    expect(again.tracks[0]?.measures[0]?.beats.slice(1).some((beat) => beat.rasgueado !== undefined)).toBe(false);
  });

  it('leaves the rasgueado out of GP3', () => {
    // Arrange
    const song = withFirstBeat(readSong(loadFixture('guitarpro5', 'strokes.gp5')), (beat) => ({ ...beat, rasgueado: 'ii' }));

    // Act
    const again = readSong(writeSong(song, 'gp3'));

    // Assert
    expect(firstBeat(again).rasgueado).toBeUndefined();
  });
});
