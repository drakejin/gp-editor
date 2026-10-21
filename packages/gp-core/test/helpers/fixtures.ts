import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');

export type FixtureFolder = 'guitarpro1' | 'guitarpro2' | 'guitarpro3' | 'guitarpro4' | 'guitarpro5' | 'guitarpro6' | 'guitarpro7' | 'guitarpro8';

/** Bytes of test/fixtures/<folder>/<name>. */
export function loadFixture(folder: FixtureFolder, name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, folder, name)));
}

/** File names in test/fixtures/<folder>, sorted; [] when the folder does not exist. */
export function listFixtures(folder: FixtureFolder): string[] {
  try {
    return readdirSync(join(FIXTURES_DIR, folder)).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return [];
  }
}
