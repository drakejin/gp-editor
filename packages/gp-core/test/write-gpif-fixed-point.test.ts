import { describe, expect, it } from 'vitest';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { type FixtureFolder, listFixtures } from './helpers/fixtures';
import { SLOW_TEST_TIMEOUT, gpRoundTrip } from './helpers/gp-round-trip';
import { songDifference } from './helpers/write-compare';

/**
 * GP1–GP6 files written as 'gp' once read back the same when written again (GP7/GP8 files already do:
 * write-gpif-round-trip). A file of its own, so that two workers share the 'gp' round trips.
 */
const OTHER_FOLDERS: readonly FixtureFolder[] = ['guitarpro1', 'guitarpro2', 'guitarpro3', 'guitarpro4', 'guitarpro5', 'guitarpro6'];

describe.each(OTHER_FOLDERS)('gp round trip of %s fixtures', (folder) => {
  it.each(listFixtures(folder))(
    '%s is a fixed point once written as gp',
    (name) => {
      // Arrange
      const { again } = gpRoundTrip(folder, name);

      // Act
      const twice = readSong(writeSong(again, 'gp'));

      // Assert
      expect(songDifference(again, twice)).toBeUndefined();
    },
    SLOW_TEST_TIMEOUT,
  );
});
