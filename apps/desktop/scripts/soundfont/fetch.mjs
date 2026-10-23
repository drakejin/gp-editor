// Node twin of fetch.sh for Windows (no bash, curl or shasum needed): fetches the GeneralUser GS SoundFont the app
// plays with by default, at the same pinned commit and checksum. The Windows build bundles it (src-tauri/tauri.conf.json).
// Usage: node scripts/soundfont/fetch.mjs   (npm run soundfont:win)
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const destination = path.join(appDir, 'macos/GPEditor-macOS/SoundFonts/GeneralUser-GS.sf2');
// GeneralUser GS v2.0.3, github.com/mrbumpy409/GeneralUser-GS at 684543d (2026-02-23).
const url = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2';
const sha256 = '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe';
const attempts = 5;

const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download() {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

if (existsSync(destination) && checksum(await readFile(destination)) === sha256) {
  process.exit(0);
}
process.stdout.write('[soundfont] downloading GeneralUser GS (32 MB)…\n');
const bytes = await download();
if (checksum(bytes) !== sha256) {
  process.stderr.write(`[soundfont] error: checksum mismatch for ${url}\n`);
  process.exit(1);
}
const temporary = `${destination}.${process.pid}.tmp`;
try {
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
process.stdout.write(`[soundfont] saved ${destination}\n`);
