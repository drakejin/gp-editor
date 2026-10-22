// Reads gp-core's fixture files in Jest. The app's tsconfig has no Node types (including them would retype timers
// app-wide), so the two Node modules used here are declared locally.
interface FileSystem {
  readdirSync(directory: string): string[];
  readFileSync(file: string): Uint8Array;
}
interface PathUtils {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
}
declare const require: (id: string) => unknown;
declare const __dirname: string;
const fs = require('fs') as FileSystem;
const path = require('path') as PathUtils;

const FIXTURES = path.resolve(__dirname, '../../../packages/gp-core/test/fixtures');

export function readFixture(folder: string, name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, folder, name)));
}

/** File names in a fixture folder, sorted; [] when the folder is missing. */
export function listFixtures(folder: string): string[] {
  try {
    return fs.readdirSync(path.join(FIXTURES, folder)).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return [];
  }
}
