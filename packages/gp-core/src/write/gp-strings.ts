// Text encoding for Guitar Pro 3–5 strings (not in TuxGuitar, which encodes with one configured charset).
import { decodeUtf8Strict, utf8Length, windows1252Byte, writeUtf8 } from '../io/text';

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

function encodeCp1252(codePoints: readonly number[]): Uint8Array | undefined {
  const bytes = new Uint8Array(codePoints.length);
  for (let i = 0; i < codePoints.length; i++) {
    const byte = windows1252Byte(codePoints[i] ?? REPLACEMENT);
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

/** UTF-8 bytes of the code points, at most `maxBytes`: the first that does not fit and those after it are left out. */
function encodeUtf8(codePoints: readonly number[], maxBytes: number): Uint8Array {
  const bytes = new Uint8Array(codePoints.reduce((sum, codePoint) => sum + utf8Length(codePoint), 0));
  let length = 0;
  for (const codePoint of codePoints) {
    if (length + utf8Length(codePoint) > maxBytes) {
      break;
    }
    length = writeUtf8(codePoint, bytes, length);
  }
  return bytes.slice(0, length);
}
