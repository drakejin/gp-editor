import type { Song } from '../../src/model/song';
import { readSong } from '../../src/read-song';
import { type WritableFormat, writeSong } from '../../src/write/index';
import { type DifferenceContext, unexplainedDifferences } from './alphatab-known-differences';
import { type AlphaTabFamily, readWithAlphaTab, viewFromScore } from './alphatab-view';
import { type ViewDifference, viewDifferences } from './cross-check-diff';
import { viewFromSong } from './cross-check-view';
import { type FixtureFolder, listFixtures, loadFixture } from './fixtures';

/** Every folder of files `readSong` reads (GP1/GP2 only when fetched, see fixtures/README.md). */
export const SOURCE_FOLDERS: readonly FixtureFolder[] = [
  'guitarpro1',
  'guitarpro2',
  'guitarpro3',
  'guitarpro4',
  'guitarpro5',
  'guitarpro6',
  'guitarpro7',
  'guitarpro8',
  'powertab',
  'tabledit',
  'midi',
  'musicxml',
];

export interface SourceFile {
  readonly folder: FixtureFolder;
  readonly name: string;
}

/** The readable fixtures (TablEdit's `invalid_*` files are broken on purpose). */
export function sourceFiles(folders: readonly FixtureFolder[] = SOURCE_FOLDERS): SourceFile[] {
  return folders.flatMap((folder) => listFixtures(folder).filter((name) => !name.startsWith('invalid_')).map((name) => ({ folder, name })));
}

const songs = new Map<string, Song>();

/** The fixture's song, read once per test file. */
export function sourceSong({ folder, name }: SourceFile): Song {
  const key = `${folder}/${name}`;
  const cached = songs.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const song = readSong(loadFixture(folder, name));
  songs.set(key, song);
  return song;
}

/** How alphaTab decodes a written format's text. */
export function familyOf(format: WritableFormat): AlphaTabFamily {
  return format === 'gp' ? 'gpif' : 'binary';
}

export interface CrossCheck {
  readonly context: DifferenceContext;
  readonly differences: readonly ViewDifference[];
  /** The differences no known difference explains. */
  readonly unexplained: readonly ViewDifference[];
}

/** gp-core's and alphaTab's readings of the same bytes, compared. */
export function compareReadings(bytes: Uint8Array, format: WritableFormat, family: AlphaTabFamily = familyOf(format)): CrossCheck {
  const song = readSong(bytes);
  const expected = viewFromSong(song);
  const differences = viewDifferences(expected, viewFromScore(readWithAlphaTab(bytes, family)));
  const context: DifferenceContext = { format, expected, song };
  return { context, differences, unexplained: unexplainedDifferences(differences, context) };
}

/** Writes the fixture's song as `format` and compares how gp-core and alphaTab read the file. */
export function crossCheck(source: SourceFile, format: WritableFormat): CrossCheck {
  return compareReadings(writeSong(sourceSong(source), format), format);
}
