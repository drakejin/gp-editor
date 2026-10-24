/* eslint-disable no-bitwise -- base64 packs 6-bit groups into bytes */
// Files cross the bridge as base64 (a song, the audio track's recording: megabytes), and Hermes runs this as plain
// JavaScript, so both ways work on pairs of characters (12 bits) through tables, four characters at a time, and the text
// is built in chunks: about five times faster in Hermes than one character at a time.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SIX_BITS = 6;
const TWELVE_BITS = 4096;
/** Two characters → their 12 bits (−1 when either is not in the alphabet), indexed by (first code << 8) | second code. */
const PAIR_VALUES = new Int16Array(1 << 16).fill(-1);
/** 12 bits → their two characters. */
const PAIR_TEXTS: string[] = [];
for (let pair = 0; pair < TWELVE_BITS; pair++) {
  const high = pair >> SIX_BITS;
  const low = pair & 63;
  PAIR_VALUES[(ALPHABET.charCodeAt(high) << 8) | ALPHABET.charCodeAt(low)] = pair;
  PAIR_TEXTS.push(`${ALPHABET[high] ?? ''}${ALPHABET[low] ?? ''}`);
}
/** Bytes encoded per piece of text (a multiple of 3), so no string grows past a few kilobytes before the join. */
const ENCODE_CHUNK = 12_288;

/** The value of two characters (−1 when either is not base64, or is outside one byte). */
function pairValue(text: string, index: number): number {
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first > 255 || second > 255 ? -1 : (PAIR_VALUES[(first << 8) | second] ?? -1);
}

function invalidCharacterError(text: string): Error {
  const invalid = [...text].find((char) => !ALPHABET.includes(char)) ?? text;
  // i18n-exempt: a diagnostic of data the app itself encoded; kept free of the catalogues (the Hermes smoke bundles this file)
  return new Error(`Invalid base64 character "${invalid}"`);
}

/** The last 2 or 3 characters (1 or 2 bytes); a single leftover character carries no whole byte. */
function decodeTail(text: string, from: number, bytes: Uint8Array, out: number): void {
  const rest = text.length - from;
  if (rest < 2) {
    return;
  }
  const high = pairValue(text, from);
  const third = rest === 3 ? ALPHABET.indexOf(text[from + 2] ?? '') : 0;
  if (high < 0 || third < 0) {
    throw invalidCharacterError(text.slice(from));
  }
  bytes[out] = high >> 4;
  if (rest === 3) {
    bytes[out + 1] = ((high & 15) << 4) | (third >> 2);
  }
}

/** Decode standard base64 (padding optional, white space skipped) into bytes. Throws on characters outside the alphabet. */
export function base64ToBytes(base64: string): Uint8Array {
  const text = base64.replace(/[\s=]/g, '');
  const whole = text.length - (text.length % 4);
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let out = 0;
  let invalid = 0;
  for (let index = 0; index < whole; index += 4) {
    const high = pairValue(text, index);
    const low = pairValue(text, index + 2);
    invalid |= high | low;
    const value = (high << 12) | low;
    bytes[out++] = (value >> 16) & 0xff;
    bytes[out++] = (value >> 8) & 0xff;
    bytes[out++] = value & 0xff;
  }
  if (invalid < 0) {
    throw invalidCharacterError(text);
  }
  decodeTail(text, whole, bytes, out);
  return bytes;
}

/** The last 1 or 2 bytes, padded with "=". */
function encodeTail(bytes: Uint8Array, from: number): string {
  const first = bytes[from];
  if (first === undefined) {
    return '';
  }
  const second = bytes[from + 1];
  const value = (first << 16) | ((second ?? 0) << 8);
  const twoChars = PAIR_TEXTS[value >> 12] ?? '';
  return second === undefined ? `${twoChars}==` : `${twoChars}${ALPHABET[(value >> 6) & 63] ?? ''}=`;
}

/** Encode bytes as standard base64 with padding. */
export function bytesToBase64(bytes: Uint8Array): string {
  const whole = bytes.length - (bytes.length % 3);
  const pieces: string[] = [];
  for (let start = 0; start < whole; start += ENCODE_CHUNK) {
    const end = Math.min(whole, start + ENCODE_CHUNK);
    let piece = '';
    for (let index = start; index < end; index += 3) {
      const value = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
      piece += `${PAIR_TEXTS[value >> 12] ?? ''}${PAIR_TEXTS[value & 4095] ?? ''}`;
    }
    pieces.push(piece);
  }
  pieces.push(encodeTail(bytes, whole));
  return pieces.join('');
}
