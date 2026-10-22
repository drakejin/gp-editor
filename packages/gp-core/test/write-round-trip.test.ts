import { describe, expect, it } from 'vitest';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';

const GP5_VERSION = 'FICHIER GUITAR PRO v5.10';

/** GP1–GP5 files: everything the reader returns survives a GP5 round trip. */
const BINARY_FOLDERS: readonly FixtureFolder[] = ['guitarpro1', 'guitarpro2', 'guitarpro3', 'guitarpro4', 'guitarpro5'];
/** GP6–GP8 files: everything GP5 can hold survives (see write-gp5-expected.ts for what it cannot). */
const GPIF_FOLDERS: readonly FixtureFolder[] = ['guitarpro6', 'guitarpro7', 'guitarpro8'];

function roundTrip(folder: FixtureFolder, name: string) {
  const song = readSong(loadFixture(folder, name));
  const bytes = writeSong(song);
  return { song, bytes, again: readSong(bytes) };
}

describe.each(BINARY_FOLDERS)('GP5 round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))('%s reads back unchanged', (name) => {
    // Arrange / Act
    const { song, again } = roundTrip(folder, name);

    // Assert
    expect(again.source).toEqual({ format: 'gp5', version: GP5_VERSION });
    expect(songDifference(expectedAfterGp5(song), again)).toBeUndefined();
  });
});

describe('GP5 round trip of guitarpro5 fixtures', () => {
  it.each(listFixtures('guitarpro5'))('%s needs no adjustment to be written as GP5', (name) => {
    // Arrange
    const song = readSong(loadFixture('guitarpro5', name));

    // Act
    const expected = expectedAfterGp5(song);

    // Assert
    expect(songDifference(song, expected)).toBeUndefined();
  });
});

describe.each(GPIF_FOLDERS)('GP5 round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))('%s keeps everything GP5 can hold', (name) => {
    // Arrange / Act
    const { song, again } = roundTrip(folder, name);

    // Assert
    assertSongInvariants(again);
    expect(songDifference(expectedAfterGp5(song, again), again)).toBeUndefined();
  });

  it.each(listFixtures(folder))('%s is a fixed point once written as GP5', (name) => {
    // Arrange
    const { again } = roundTrip(folder, name);

    // Act
    const twice = readSong(writeSong(again));

    // Assert
    expect(songDifference(again, twice)).toBeUndefined();
  });
});
