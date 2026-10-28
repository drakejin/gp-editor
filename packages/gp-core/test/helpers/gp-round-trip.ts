import type { Song } from '../../src/model/song';
import { readSong, readSongFile } from '../../src/read-song';
import { writeSong } from '../../src/write/index';
import { type FixtureFolder, loadFixture } from './fixtures';

/** The largest fixtures (canon's 224 bars of nine tracks, with its audio file) take seconds to write and read back twice. */
export const SLOW_TEST_TIMEOUT = 60000;

/** A fixture written as 'gp' and read back; its audio track's file goes along, as the app saves it (canon-audio-track.gp). */
export function gpRoundTrip(folder: FixtureFolder, name: string): { readonly song: Song; readonly again: Song } {
  const { song, audioTrackData } = readSongFile(loadFixture(folder, name));
  return { song, again: readSong(writeSong(song, 'gp', { audioTrackData })) };
}
