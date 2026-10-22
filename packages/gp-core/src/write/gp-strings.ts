import { decodeUtf8Strict } from '../io/text';

/**
 * Text encoding for Guitar Pro 3–5 strings, built so that `readSong`'s default 'auto' charset reads
 * every string back unchanged (no TextEncoder: Hermes has none).
 *
 * - windows-1252 (one byte per character, what Guitar Pro 5 and TuxGuitar write on Western systems)
 *   when every character has a windows-1252 byte and those bytes are not also valid UTF-8;
 * - UTF-8 otherwise (Korean, Japanese, emoji …, or the rare windows-1252 text such as "Ã©" whose
 *   bytes would read back as different UTF-8 text). Guitar Pro itself shows such strings as mojibake.
 *
 * Lone surrogates become U+FFFD.
 */

const REPLACEMENT = 0xfffd;
const NO_LIMIT = Number.POSITIVE_INFINITY;

/** windows-1252 bytes 0x80–0x9F by code point (the other bytes equal their latin-1 code point). */
const CP1252_HIGH_BYTES: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
  [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/** Bytes of `text` for a Guitar Pro string field, at most `maxBytes` long, cut between characters. */
export function encodeGpString(text: string, maxBytes: number = NO_LIMIT): Uint8Array {
  const codePoints = toCodePoints(text);
  const cp1252 = encodeCp1252(codePoints);
  if (cp1252 !== undefined) {
    const fitted = cp1252.subarray(0, Math.min(cp1252.length, maxBytes));
    if (!isReadAsOtherUtf8(fitted)) {
      return fitted;
    }
  }
  return encodeUtf8(codePoints, maxBytes);
}

function toCodePoints(text: string): number[] {
  const codePoints: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? REPLACEMENT;
    codePoints.push(codePoint >= 0xd800 && codePoint <= 0xdfff ? REPLACEMENT : codePoint);
  }
  return codePoints;
}

function cp1252Byte(codePoint: number): number | undefined {
  if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) {
    return codePoint;
  }
  return CP1252_HIGH_BYTES.get(codePoint);
}

function encodeCp1252(codePoints: readonly number[]): Uint8Array | undefined {
  const bytes = new Uint8Array(codePoints.length);
  for (let i = 0; i < codePoints.length; i++) {
    const byte = cp1252Byte(codePoints[i] ?? REPLACEMENT);
    if (byte === undefined) {
      return undefined;
    }
    bytes[i] = byte;
  }
  return bytes;
}

/** Non-ASCII windows-1252 bytes that are valid UTF-8 would be decoded as UTF-8 by the 'auto' charset. */
function isReadAsOtherUtf8(bytes: Uint8Array): boolean {
  return bytes.some((byte) => byte >= 0x80) && decodeUtf8Strict(bytes) !== undefined;
}

function utf8Bytes(codePoint: number): number[] {
  if (codePoint < 0x80) {
    return [codePoint];
  }
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

function encodeUtf8(codePoints: readonly number[], maxBytes: number): Uint8Array {
  const bytes: number[] = [];
  for (const codePoint of codePoints) {
    const encoded = utf8Bytes(codePoint);
    if (bytes.length + encoded.length > maxBytes) {
      break;
    }
    bytes.push(...encoded);
  }
  return Uint8Array.from(bytes);
}
