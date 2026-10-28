// The SMuFL code points the engravers draw, from their sources: literal private-use characters, \uE… escapes and 0xE…
// numbers, and the digit glyphs that follow a digit zero (time signatures, tuplets). Usage: node scan.mjs <src dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Glyphs written as a zero's code point plus a digit (`digitGlyphs`). */
const DIGIT_ZEROS = [0xe080, 0xe880];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? files(file) : /\.tsx?$/.test(name) && !name.endsWith('glyph-ink.ts') ? [file] : [];
  });
}

const found = new Set(DIGIT_ZEROS.flatMap((zero) => Array.from({ length: 10 }, (_, digit) => zero + digit)));
for (const file of files(process.argv[2])) {
  const text = readFileSync(file, 'utf8');
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0xe000 && code <= 0xf8ff) found.add(code);
  }
  for (const match of text.matchAll(/\\u\{?([Ee][0-9A-Fa-f]{3})\}?|0x([Ee][0-9A-Fa-f]{3})\b/g)) {
    found.add(Number.parseInt(match[1] ?? match[2], 16));
  }
}
process.stdout.write([...found].sort((a, b) => a - b).map((code) => code.toString(16)).join('\n') + '\n');
