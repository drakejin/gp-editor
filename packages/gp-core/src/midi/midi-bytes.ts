// Byte encodings of TuxGuitar MidiFileWriter / MidiMessageUtils (LGPL-2.1), without Node: variable-length quantities (text: io/text encodeUtf8).

const SEVEN_BITS = 0x7f;
const CONTINUATION = 0x80;

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
