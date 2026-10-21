// Port of TuxGuitar app.tuxguitar.io.gpx.v6.GPXFileSystem and GPXByteBuffer (LGPL-2.1).
import { GpFormatError } from '../../errors';
import { decodeWindows1252 } from '../../io/text';

/**
 * Guitar Pro 6 container. A `.gpx` file is either
 * - `BCFS`: a little sector file system (0x1000-byte sectors), or
 * - `BCFZ`: a BCFS image compressed with a bit-level LZ77 variant.
 * The GPIF document is the file named `score.gpif`.
 */

const SECTOR_SIZE = 0x1000;
const ENTRY_FILE = 2;
const ENTRY_NAME_OFFSET = 0x04;
const ENTRY_NAME_LENGTH = 127;
const ENTRY_SIZE_OFFSET = 0x8c;
const ENTRY_BLOCKS_OFFSET = 0x94;
const MAGIC_LENGTH = 4;
const MAGIC_BCFS = 'BCFS';
const MAGIC_BCFZ = 'BCFZ';

/** Name of the GPIF document inside a GP6 container. */
export const GPX_SCORE_FILE = 'score.gpif';

/** Files of a `.gpx` container (BCFZ or BCFS, magic included), in container order. */
export function readGpxContainer(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const magic = readMagic(bytes);
  const body = bytes.subarray(MAGIC_LENGTH);
  if (magic === MAGIC_BCFS) {
    return readBcfsFiles(body);
  }
  if (magic === MAGIC_BCFZ) {
    const image = decompressBcfz(body);
    if (readMagic(image) !== MAGIC_BCFS) {
      throw new GpFormatError('Corrupt gpx file: BCFZ data does not inflate to a BCFS file system');
    }
    return readBcfsFiles(image.subarray(MAGIC_LENGTH));
  }
  throw new GpFormatError('Not a gpx container: expected a BCFZ or BCFS header');
}

function readMagic(bytes: Uint8Array): string {
  return bytes.length < MAGIC_LENGTH ? '' : decodeWindows1252(bytes.subarray(0, MAGIC_LENGTH));
}

/**
 * Inflate a BCFZ body (the bytes after the "BCFZ" magic): an int32 uncompressed length, then a bit
 * stream of literal runs (flag 0) and back-references (flag 1). Stops at the declared length or at
 * the end of the input, whichever comes first.
 */
export function decompressBcfz(body: Uint8Array): Uint8Array {
  if (body.length < 4) {
    throw new GpFormatError('Corrupt gpx file: truncated BCFZ header');
  }
  const expected = readInt(body, 0);
  const bits = new BitReader(body.subarray(4));
  const out = new GrowableBytes(Math.max(0, Math.min(expected, body.length * 16)));
  try {
    while (out.length < expected) {
      if (bits.readBits(1) === 1) {
        copyBackReference(bits, out);
      } else {
        copyLiterals(bits, out);
      }
    }
  } catch (error) {
    // The stream may end inside a token (padding bits); keep what was inflated, like alphaTab.
    if (!(error instanceof EndOfBitsError)) {
      throw error;
    }
  }
  return out.toBytes();
}

function copyBackReference(bits: BitReader, out: GrowableBytes): void {
  const wordSize = bits.readBits(4);
  const offset = bits.readBitsReversed(wordSize);
  const size = bits.readBitsReversed(wordSize);
  const from = out.length - offset;
  if (from < 0) {
    throw new GpFormatError(`Corrupt gpx file: BCFZ back-reference ${offset} is outside the data`);
  }
  out.copyWithin(from, Math.min(offset, size));
}

function copyLiterals(bits: BitReader, out: GrowableBytes): void {
  const size = bits.readBitsReversed(2);
  for (let i = 0; i < size; i++) {
    out.push(bits.readBits(8));
  }
}

/** Files of a BCFS image (the bytes after the "BCFS" magic). Entries whose data is incomplete are skipped. */
export function readBcfsFiles(image: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while ((offset += SECTOR_SIZE) + 3 < image.length) {
    if (readInt(image, offset) !== ENTRY_FILE) {
      continue;
    }
    const entry = readEntry(image, offset);
    if (entry.data !== undefined && !files.has(entry.name)) {
      files.set(entry.name, entry.data);
    }
    // Like TuxGuitar, continue scanning after the entry's last data sector.
    offset = Math.max(offset, entry.lastSector * SECTOR_SIZE);
  }
  return files;
}

interface BcfsEntry {
  readonly name: string;
  readonly data: Uint8Array | undefined;
  readonly lastSector: number;
}

function readEntry(image: Uint8Array, offset: number): BcfsEntry {
  const name = readCString(image, offset + ENTRY_NAME_OFFSET, ENTRY_NAME_LENGTH);
  const size = readInt(image, offset + ENTRY_SIZE_OFFSET);
  const sectors = readSectorList(image, offset + ENTRY_BLOCKS_OFFSET);
  const data = new Uint8Array(sectors.length * SECTOR_SIZE);
  sectors.forEach((sector, i) => {
    data.set(image.subarray(sector * SECTOR_SIZE, (sector + 1) * SECTOR_SIZE), i * SECTOR_SIZE);
  });
  const complete = size >= 0 && data.length >= size;
  return { name, data: complete ? data.subarray(0, size) : undefined, lastSector: sectors[sectors.length - 1] ?? 0 };
}

function readSectorList(image: Uint8Array, offset: number): readonly number[] {
  const sectors: number[] = [];
  for (let at = offset; at + 3 < image.length; at += 4) {
    const sector = readInt(image, at);
    if (sector === 0) {
      return sectors;
    }
    if (sector < 0 || sector * SECTOR_SIZE >= image.length) {
      throw new GpFormatError(`Corrupt gpx file: sector ${sector} is outside the file system`);
    }
    sectors.push(sector);
  }
  return sectors;
}

function readInt(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  );
}

function readCString(bytes: Uint8Array, offset: number, maxLength: number): string {
  const end = offset + maxLength;
  let stop = offset;
  while (stop < end && stop < bytes.length && bytes[stop] !== 0) {
    stop++;
  }
  return decodeWindows1252(bytes.subarray(offset, stop));
}

class EndOfBitsError extends Error {}

/** MSB-first bit cursor (GPXByteBuffer). Reading past the end throws EndOfBitsError. */
class BitReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBit(): number {
    const byte = this.bytes[this.position >> 3];
    if (byte === undefined) {
      throw new EndOfBitsError('end of BCFZ stream');
    }
    const bit = (byte >> (7 - (this.position & 7))) & 1;
    this.position++;
    return bit;
  }

  readBits(count: number): number {
    let bits = 0;
    for (let i = count - 1; i >= 0; i--) {
      bits |= this.readBit() << i;
    }
    return bits;
  }

  readBitsReversed(count: number): number {
    let bits = 0;
    for (let i = 0; i < count; i++) {
      bits |= this.readBit() << i;
    }
    return bits;
  }
}

/** Append-only byte buffer used while inflating. */
class GrowableBytes {
  private buffer: Uint8Array;
  private size = 0;

  constructor(capacity: number) {
    this.buffer = new Uint8Array(Math.max(capacity, 64));
  }

  get length(): number {
    return this.size;
  }

  push(byte: number): void {
    this.ensure(1);
    this.buffer[this.size++] = byte;
  }

  /** Append `count` bytes starting at `from` (count <= length - from, so no overlap issues). */
  copyWithin(from: number, count: number): void {
    this.ensure(count);
    this.buffer.copyWithin(this.size, from, from + count);
    this.size += count;
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }

  private ensure(extra: number): void {
    if (this.size + extra <= this.buffer.length) {
      return;
    }
    const next = new Uint8Array(Math.max(this.buffer.length * 2, this.size + extra));
    next.set(this.buffer.subarray(0, this.size));
    this.buffer = next;
  }
}
