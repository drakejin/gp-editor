import { describe, expect, it } from 'vitest';
import { readSong, type Song, writeAsciiTab } from '../src/index';
import { type FixtureFolder, listFixtures, loadFixture } from './helpers/fixtures';

const FOLDERS: readonly FixtureFolder[] = [
  'guitarpro1',
  'guitarpro2',
  'guitarpro3',
  'guitarpro4',
  'guitarpro5',
  'guitarpro6',
  'guitarpro7',
  'guitarpro8',
];

const FIXTURES = FOLDERS.flatMap((folder) => listFixtures(folder).map((name) => [folder, name] as const)).filter(
  ([, name]) => !name.endsWith('.sh') && !name.endsWith('.md'),
);

/** A string row: the string's note name right-aligned, then bars, closed by a bar line. */
const STRING_ROW = /^ *[A-G]#?\|.*\|$/;
/** The default line width (TuxGuitar's); only a bar wider than that gets a longer line, a system of its own. */
const LINE_WIDTH = 80;

/** Fixtures our readers reject on purpose (corrupt files kept to test the error path). */
function readable(folder: FixtureFolder, name: string): Song | undefined {
  try {
    return readSong(loadFixture(folder, name));
  } catch {
    return undefined;
  }
}

/** One track's systems as written: the blocks between blank lines after the "Track N: name" line. */
function systemsOfTrack(song: Song, trackIndex: number): string[][] {
  const text = writeAsciiTab(song, { trackIndexes: [trackIndex] });
  const [, ...systems] = text.slice(text.indexOf('\nTrack ')).split('\n\n');
  return systems.map((block) => block.split('\n').filter((line) => line !== ''));
}

describe('writeAsciiTab fixture sweep', () => {
  it('finds fixtures in every committed folder', () => {
    // Assert
    expect(FIXTURES.length).toBeGreaterThan(200);
  });

  it.each(FIXTURES)('writes %s/%s as systems of equal-width string rows', (folder, name) => {
    // Arrange
    const song = readable(folder, name);
    if (song === undefined) {
      return;
    }

    // Act / Assert
    expect(() => writeAsciiTab(song)).not.toThrow();
    song.tracks.forEach((track, trackIndex) => {
      const systems = systemsOfTrack(song, trackIndex);
      expect(systems.length > 0).toBe(track.strings.length > 0);
      for (const system of systems) {
        const rows = system.slice(-track.strings.length);
        const width = rows[0]?.length ?? 0;
        expect(system.length - rows.length).toBeLessThanOrEqual(1);
        expect(rows.every((row) => STRING_ROW.test(row) && row.length === width)).toBe(true);
        expect((system[0] ?? '').length).toBeLessThanOrEqual(width);
        expect(width <= LINE_WIDTH || rows[0]?.split('|').length === 3).toBe(true);
      }
    });
  });
});
