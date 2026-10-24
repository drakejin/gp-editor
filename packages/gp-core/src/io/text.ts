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
  const units = new Uint16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    units[i] = byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte - 0x80] ?? REPLACEMENT) : byte;
  }
  return unitsToString(units, units.length);
}

/** UTF-8 decode that returns undefined on any malformed sequence. */
export function decodeUtf8Strict(bytes: Uint8Array): string | undefined {
  return decodeUtf8(bytes, true);
}

/** UTF-8 decode that substitutes U+FFFD for malformed sequences. */
export function decodeUtf8Lenient(bytes: Uint8Array): string {
  return decodeUtf8(bytes, false) ?? '';
}

/** Not a code point: what utf8SequenceAt returns for a malformed sequence. */
const MALFORMED = -1;
const SUPPLEMENTARY_START = 0x10000;

/**
 * Decodes into UTF-16 code units, written straight into one buffer: no object or string per character, which is what
 * a large GPIF or MusicXML document costs in Hermes (no JIT). A byte never yields more than one unit (a four-byte
 * sequence yields two), so the buffer is as long as the bytes.
 */
function decodeUtf8(bytes: Uint8Array, strict: boolean): string | undefined {
  const units = new Uint16Array(bytes.length);
  let length = 0;
  let i = 0;
  while (i < bytes.length) {
    const first = bytes[i] ?? 0;
    if (first < 0x80) {
      units[length++] = first;
      i += 1;
      continue;
    }
    const sequenceLength = utf8SequenceLength(first);
    const codePoint = utf8SequenceAt(bytes, i, sequenceLength);
    if (codePoint === MALFORMED) {
      if (strict) {
        return undefined;
      }
      units[length++] = REPLACEMENT;
      i += 1;
    } else if (codePoint >= SUPPLEMENTARY_START) {
      units[length++] = 0xd800 + ((codePoint - SUPPLEMENTARY_START) >> 10);
      units[length++] = 0xdc00 + ((codePoint - SUPPLEMENTARY_START) & 0x3ff);
      i += sequenceLength;
    } else {
      units[length++] = codePoint;
      i += sequenceLength;
    }
  }
  return unitsToString(units, length);
}

/** Bytes of the sequence a lead byte (>= 0x80) starts; 0 when it cannot start one. F5–FF count as three-byte leads. */
function utf8SequenceLength(first: number): number {
  return first >= 0xf0 && first <= 0xf4 ? 4 : first >= 0xe0 ? 3 : first >= 0xc2 && first < 0xe0 ? 2 : 0;
}

/** The code point of the multi-byte sequence at `at`, or MALFORMED (truncated, bad continuation, overlong, surrogate, too large). */
function utf8SequenceAt(bytes: Uint8Array, at: number, length: number): number {
  if (length === 0 || at + length > bytes.length) {
    return MALFORMED;
  }
  let codePoint = (bytes[at] ?? 0) & (0xff >> (length + 1));
  for (let k = 1; k < length; k++) {
    const next = bytes[at + k] ?? 0;
    if ((next & 0xc0) !== 0x80) {
      return MALFORMED;
    }
    codePoint = (codePoint << 6) | (next & 0x3f);
  }
  const minimum = length === 2 ? 0x80 : length === 3 ? 0x800 : SUPPLEMENTARY_START;
  if (codePoint < minimum || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return MALFORMED;
  }
  return codePoint;
}

/** Code units per String.fromCharCode call: well under any engine's argument limit. */
const CHUNK = 0x1000;

function unitsToString(units: Uint16Array, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += CHUNK) {
    // A typed array is an argument list as it is: copying each chunk into an array (Array.from) costs ~20x in Hermes.
    const chunk: string = Reflect.apply(String.fromCharCode, undefined, units.subarray(i, Math.min(i + CHUNK, length)));
    out += chunk;
  }
  return out;
}

/** A UTF-16 code unit never takes more than three UTF-8 bytes (a surrogate pair: two units, four bytes). */
const UTF8_MAX_BYTES_PER_UNIT = 3;

/** The code point at `index` (a surrogate pair read as one), U+FFFD for a lone surrogate. */
function codePointAt(text: string, index: number): number {
  const unit = text.charCodeAt(index);
  if (unit < 0xd800 || unit > 0xdfff) {
    return unit;
  }
  const next = text.charCodeAt(index + 1);
  return unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 0x10000 + ((unit - 0xd800) << 10) + (next - 0xdc00) : REPLACEMENT;
}

/**
 * UTF-8 bytes of a string (no TextEncoder: Hermes has none). Lone surrogates become U+FFFD. Walks code units rather
 * than iterating the string, which allocates a string per character in Hermes.
 */
export function encodeUtf8(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * UTF8_MAX_BYTES_PER_UNIT);
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const codePoint = codePointAt(text, i);
    if (codePoint >= 0x10000) {
      i++;
    }
    if (codePoint < 0x80) {
      bytes[length++] = codePoint;
    } else if (codePoint < 0x800) {
      bytes[length++] = 0xc0 | (codePoint >> 6);
      bytes[length++] = 0x80 | (codePoint & 0x3f);
    } else if (codePoint < 0x10000) {
      bytes[length++] = 0xe0 | (codePoint >> 12);
      bytes[length++] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[length++] = 0x80 | (codePoint & 0x3f);
    } else {
      bytes[length++] = 0xf0 | (codePoint >> 18);
      bytes[length++] = 0x80 | ((codePoint >> 12) & 0x3f);
      bytes[length++] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[length++] = 0x80 | (codePoint & 0x3f);
    }
  }
  return bytes.slice(0, length);
}
