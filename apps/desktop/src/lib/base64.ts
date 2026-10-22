const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: ReadonlyMap<string, number> = new Map([...ALPHABET].map((char, index) => [char, index]));

/** Decode standard base64 (padding optional) into bytes. Throws on characters outside the alphabet. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\s=]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    const value = LOOKUP.get(char);
    if (value === undefined) {
      throw new Error(`Invalid base64 character "${char}"`);
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, out);
}

/** Encode bytes as standard base64 with padding. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(triple >> 18) & 63] ?? '';
    out += ALPHABET[(triple >> 12) & 63] ?? '';
    out += b === undefined ? '=' : (ALPHABET[(triple >> 6) & 63] ?? '');
    out += c === undefined ? '=' : (ALPHABET[triple & 63] ?? '');
  }
  return out;
}
