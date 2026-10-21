/**
 * Text decoding that works without a global TextDecoder (Hermes, the React Native
 * engine, does not ship one).
 *
 * Guitar Pro 3–5 store strings in the writer's ANSI code page, so the encoding is
 * not in the file. 'auto' takes the bytes as UTF-8 when they are valid UTF-8 and
 * otherwise as windows-1252. Any other label is handed to TextDecoder when the
 * runtime has one (e.g. 'euc-kr', 'shift_jis'), and falls back to 'auto' if not.
 */

export type Charset = 'auto' | 'utf-8' | 'windows-1252' | (string & {});

const REPLACEMENT = 0xfffd;

/** windows-1252 code points for bytes 0x80–0x9F (the rest equal latin-1). */
const CP1252_HIGH: readonly number[] = [
  0x20ac, REPLACEMENT, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, REPLACEMENT, 0x017d, REPLACEMENT, REPLACEMENT, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, REPLACEMENT, 0x017e, 0x0178,
];

export function decodeText(bytes: Uint8Array, charset: Charset = 'auto'): string {
  const label = charset.toLowerCase();
  if (label === 'auto') {
    return decodeUtf8Strict(bytes) ?? decodeWindows1252(bytes);
  }
  if (label === 'utf-8' || label === 'utf8') {
    return decodeUtf8Lenient(bytes);
  }
  if (label === 'windows-1252' || label === 'cp1252' || label === 'latin1' || label === 'iso-8859-1') {
    return decodeWindows1252(bytes);
  }
  return decodeWithRuntime(bytes, label) ?? decodeText(bytes, 'auto');
}

function decodeWithRuntime(bytes: Uint8Array, label: string): string | undefined {
  const Decoder = (globalThis as { TextDecoder?: new (label: string) => { decode(b: Uint8Array): string } })
    .TextDecoder;
  if (Decoder === undefined) {
    return undefined;
  }
  try {
    return new Decoder(label).decode(bytes);
  } catch {
    return undefined;
  }
}

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte - 0x80] ?? REPLACEMENT) : byte);
  }
  return out;
}

/** UTF-8 decode that returns undefined on any malformed sequence. */
export function decodeUtf8Strict(bytes: Uint8Array): string | undefined {
  return decodeUtf8(bytes, true);
}

/** UTF-8 decode that substitutes U+FFFD for malformed sequences. */
export function decodeUtf8Lenient(bytes: Uint8Array): string {
  return decodeUtf8(bytes, false) ?? '';
}

function decodeUtf8(bytes: Uint8Array, strict: boolean): string | undefined {
  const codePoints: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const decoded = decodeUtf8CodePoint(bytes, i);
    if (decoded === undefined) {
      if (strict) {
        return undefined;
      }
      codePoints.push(REPLACEMENT);
      i += 1;
      continue;
    }
    codePoints.push(decoded.codePoint);
    i += decoded.length;
  }
  return codePointsToString(codePoints);
}

interface DecodedCodePoint {
  readonly codePoint: number;
  readonly length: number;
}

function decodeUtf8CodePoint(bytes: Uint8Array, at: number): DecodedCodePoint | undefined {
  const first = bytes[at] ?? 0;
  if (first < 0x80) {
    return { codePoint: first, length: 1 };
  }
  const length = first >= 0xf0 && first <= 0xf4 ? 4 : first >= 0xe0 ? 3 : first >= 0xc2 && first < 0xe0 ? 2 : 0;
  if (length === 0 || at + length > bytes.length) {
    return undefined;
  }
  let codePoint = first & (0xff >> (length + 1));
  for (let k = 1; k < length; k++) {
    const next = bytes[at + k] ?? 0;
    if ((next & 0xc0) !== 0x80) {
      return undefined;
    }
    codePoint = (codePoint << 6) | (next & 0x3f);
  }
  const minimum = length === 2 ? 0x80 : length === 3 ? 0x800 : 0x10000;
  if (codePoint < minimum || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return undefined;
  }
  return { codePoint, length };
}

const CHUNK = 0x1000;

function codePointsToString(codePoints: readonly number[]): string {
  let out = '';
  for (let i = 0; i < codePoints.length; i += CHUNK) {
    out += String.fromCodePoint(...codePoints.slice(i, i + CHUNK));
  }
  return out;
}
