// Byte encodings of TuxGuitar MidiFileWriter / MidiMessageUtils (LGPL-2.1), without Node or TextEncoder.

const SEVEN_BITS = 0x7f;
const CONTINUATION = 0x80;
const REPLACEMENT_CHARACTER = 0xfffd;

/** Standard MIDI File variable-length quantity (7 bits per byte, most significant first). */
export function variableLength(value: number): number[] {
  const bytes: number[] = [];
  writeVariableLength(bytes, 0, value);
  return bytes;
}

/** How many bytes variableLength(value) takes. */
export function variableLengthSize(value: number): number {
  let size = 1;
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) {
    size++;
  }
  return size;
}

/** variableLength's bytes written into `bytes` from `offset`, without an array of their own; the offset after them. */
export function writeVariableLength(bytes: Uint8Array | number[], offset: number, value: number): number {
  let at = offset;
  for (let group = variableLengthSize(value) - 1; group > 0; group--) {
    bytes[at++] = (Math.floor(value / 128 ** group) & SEVEN_BITS) | CONTINUATION;
  }
  bytes[at++] = value & SEVEN_BITS;
  return at;
}

function codePointBytes(codePoint: number): number[] {
  if (codePoint < 0x80) {
    return [codePoint];
  }
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), CONTINUATION | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), CONTINUATION | ((codePoint >> 6) & 0x3f), CONTINUATION | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    CONTINUATION | ((codePoint >> 12) & 0x3f),
    CONTINUATION | ((codePoint >> 6) & 0x3f),
    CONTINUATION | (codePoint & 0x3f),
  ];
}

function isSurrogate(codePoint: number): boolean {
  return codePoint >= 0xd800 && codePoint <= 0xdfff;
}

/** UTF-8 bytes of a string (as Java's String.getBytes("UTF-8")); lone surrogates become U+FFFD. */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? REPLACEMENT_CHARACTER;
    bytes.push(...codePointBytes(isSurrogate(codePoint) ? REPLACEMENT_CHARACTER : codePoint));
  }
  return bytes;
}
