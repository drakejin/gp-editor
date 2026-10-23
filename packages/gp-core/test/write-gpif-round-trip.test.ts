import { describe, expect, it } from 'vitest';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';
import { assertSongInvariants } from './helpers/invariants';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp } from './helpers/write-expected-gpif';

/** GP7/GP8 files: everything the reader returns survives a 'gp' round trip unchanged. */
const GP_FOLDERS: readonly FixtureFolder[] = ['guitarpro7', 'guitarpro8'];
/** Every other format: everything GPIF can hold survives (write-expected-gpif.ts lists what it cannot). */
const OTHER_FOLDERS: readonly FixtureFolder[] = ['guitarpro1', 'guitarpro2', 'guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6'];
/** The largest fixtures take a second or two to write and read back twice. */
const SLOW_TEST_TIMEOUT = 30000;

function roundTrip(folder: FixtureFolder, name: string) {
  const song = readSong(loadFixture(folder, name));
  return { song, again: readSong(writeSong(song, 'gp')) };
}

describe.each(GP_FOLDERS)('gp round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))(
    '%s reads back unchanged',
    (name) => {
      // Arrange / Act
      const { song, again } = roundTrip(folder, name);

      // Assert
      assertSongInvariants(again);
      expect(again.source.format).toBe('gp7');
      expect(songDifference(song, again)).toBeUndefined();
    },
    SLOW_TEST_TIMEOUT,
  );

  it.each(listFixtures(folder))('%s needs no adjustment to be written as gp', (name) => {
    // Arrange
    const song = readSong(loadFixture(folder, name));

    // Act
    const expected = expectedAfterGp(song);

    // Assert
    expect(songDifference(song, expected)).toBeUndefined();
  }, SLOW_TEST_TIMEOUT);
});

describe.each(OTHER_FOLDERS)('gp round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))(
    '%s keeps everything GPIF can hold',
    (name) => {
      // Arrange / Act
      const { song, again } = roundTrip(folder, name);

      // Assert
      assertSongInvariants(again);
      expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
    },
    SLOW_TEST_TIMEOUT,
  );

  it.each(listFixtures(folder))(
    '%s is a fixed point once written as gp',
    (name) => {
      // Arrange
      const { again } = roundTrip(folder, name);

      // Act
      const twice = readSong(writeSong(again, 'gp'));

      // Assert
      expect(songDifference(again, twice)).toBeUndefined();
    },
    SLOW_TEST_TIMEOUT,
  );
});
