// Port of TuxGuitar app.tuxguitar.io.tef3.TEInputStream.readFileHeader and TEFileFormatDetector (LGPL-2.1).

/** The fixed header every TablEdit 3 file starts with. */
export const TEF_HEADER_SIZE = 256;

const MAJOR_VERSION = 3;
const MAJOR_VERSION_OFFSET = 3;
const MINOR_VERSION_OFFSET = 2;
/** Bytes 16–23 are always zero. */
const ZERO_BLOCK = { from: 16, to: 24 } as const;
const TAG_OFFSET = 56;
/** "tbed" as TuxGuitar checks it, and as TablEdit writes it: a little-endian number, so the bytes read "debt". */
const TAGS: readonly (readonly number[])[] = [
  [0x74, 0x62, 0x65, 0x64],
  [0x64, 0x65, 0x62, 0x74],
];
const OLD_NUM_OFFSET = 202;
const OLD_NUM = 4;
const FORMAT_LO_OFFSET = 204;
const FORMAT_LO = 4;
const FORMAT_HI = 10;

/** Header offsets of the sections a file may leave out (0 = absent). */
const TEXT_EVENTS_OFFSET = 84;
const CHORDS_OFFSET = 88;
const READING_LIST_OFFSET = 128;
const URL_OFFSET = 132;
const COPYRIGHT_OFFSET = 140;

/** TEFileMetadata: what the header says about the rest of the file. */
export interface TeFileMetadata {
  readonly initialBpm: number;
  readonly toneChorus: number;
  readonly toneReverb: number;
  readonly hasTextEvents: boolean;
  readonly hasChords: boolean;
  readonly hasCopyright: boolean;
  readonly hasReadingList: boolean;
  readonly hasUrl: boolean;
}

/**
 * The TablEdit version ("3.04") when the bytes start with a TablEdit 3 header, else undefined. Every field TablEdit's
 * authors told TuxGuitar to check is checked.
 */
export function readTefVersion(bytes: Uint8Array): string | undefined {
  if (bytes.length < TEF_HEADER_SIZE || bytes[MAJOR_VERSION_OFFSET] !== MAJOR_VERSION) {
    return undefined;
  }
  const isZeroBlock = bytes.subarray(ZERO_BLOCK.from, ZERO_BLOCK.to).every((byte) => byte === 0);
  const tag = Array.from(bytes.subarray(TAG_OFFSET, TAG_OFFSET + 4));
  const hasTag = TAGS.some((expected) => expected.every((byte, i) => tag[i] === byte));
  const hasFormat =
    uint16(bytes, OLD_NUM_OFFSET) === OLD_NUM && bytes[FORMAT_LO_OFFSET] === FORMAT_LO && bytes[FORMAT_LO_OFFSET + 1] === FORMAT_HI;
  if (!isZeroBlock || !hasTag || !hasFormat) {
    return undefined;
  }
  return `${MAJOR_VERSION}.${String(bytes[MINOR_VERSION_OFFSET] ?? 0).padStart(2, '0')}`;
}

/** The header's tempo, tone and section flags (call after readTefVersion accepted the bytes). */
export function readTefFileMetadata(bytes: Uint8Array): TeFileMetadata {
  const isPresent = (offset: number): boolean => bytes.subarray(offset, offset + 4).some((byte) => byte !== 0);
  return {
    initialBpm: uint16(bytes, 6),
    toneChorus: uint16(bytes, 8),
    toneReverb: uint16(bytes, 10),
    hasTextEvents: isPresent(TEXT_EVENTS_OFFSET),
    hasChords: isPresent(CHORDS_OFFSET),
    hasCopyright: isPresent(COPYRIGHT_OFFSET),
    hasReadingList: isPresent(READING_LIST_OFFSET),
    hasUrl: isPresent(URL_OFFSET),
  };
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}
