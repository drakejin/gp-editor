// Reads the app icon's files in Jest: a PNG's header and whether its chunks run whole to IEND, the images an .ico
// holds. The app's tsconfig has no Node types (see fixtures.ts), so the two Node modules used here are declared locally.
interface FileSystem {
  existsSync(file: string): boolean;
  readFileSync(file: string): Uint8Array;
  readFileSync(file: string, encoding: 'utf8'): string;
}
interface PathUtils {
  resolve(...parts: string[]): string;
}
declare const require: (id: string) => unknown;
declare const __dirname: string;
const fs = require('fs') as FileSystem;
const path = require('path') as PathUtils;

const APP_DIR = path.resolve(__dirname, '..');

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A chunk's length, type and CRC around its data. */
const PNG_CHUNK_FRAME = 12;
/** PNG colour type 6: red, green, blue and alpha. */
export const PNG_RGBA = 6;
const ICO_HEADER = 6;
const ICO_ENTRY = 16;

export interface PngInfo {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  /** The chunks run from IHDR to IEND and end exactly at the last byte. */
  readonly isComplete: boolean;
}

/** One image in an .ico: its directory entry and the bytes it points at. */
export interface IcoImage {
  readonly width: number;
  readonly height: number;
  readonly planes: number;
  readonly bitCount: number;
  readonly offset: number;
  readonly size: number;
  readonly data: Uint8Array;
}

/** A file of the app, by its path from apps/desktop; undefined when it does not exist. */
export function readAppFile(relativePath: string): Uint8Array | undefined {
  const file = path.resolve(APP_DIR, relativePath);
  return fs.existsSync(file)
    ? new Uint8Array(fs.readFileSync(file))
    : undefined;
}

export function readAppText(relativePath: string): string {
  return fs.readFileSync(path.resolve(APP_DIR, relativePath), 'utf8');
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
}

/** Whether a PNG's chunks, from the first, run whole to IEND and end exactly at the file's last byte. */
function hasWholeChunks(bytes: Uint8Array): boolean {
  const data = view(bytes);
  let offset = PNG_SIGNATURE.length;
  while (offset + PNG_CHUNK_FRAME <= bytes.length) {
    const next = offset + PNG_CHUNK_FRAME + data.getUint32(offset);
    if (chunkType(bytes, offset) === 'IEND') {
      return next === bytes.length;
    }
    offset = next;
  }
  return false;
}

/** A PNG's IHDR (width, height, bit depth, colour type) and completeness; undefined for anything else. */
export function pngInfo(bytes: Uint8Array): PngInfo | undefined {
  const isPng = PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (
    bytes.length < 26 ||
    !isPng ||
    chunkType(bytes, PNG_SIGNATURE.length) !== 'IHDR'
  ) {
    return undefined;
  }
  const data = view(bytes);
  return {
    width: data.getUint32(16),
    height: data.getUint32(20),
    bitDepth: data.getUint8(24),
    colorType: data.getUint8(25),
    isComplete: hasWholeChunks(bytes),
  };
}

function icoImage(bytes: Uint8Array, entry: number): IcoImage {
  const data = view(bytes);
  const offset = data.getUint32(entry + 12, true);
  const size = data.getUint32(entry + 8, true);
  if (offset + size > bytes.length) {
    throw new Error(
      `an .ico image runs past the file's end (${offset} + ${size} > ${bytes.length})`,
    );
  }
  return {
    width: data.getUint8(entry) || 256,
    height: data.getUint8(entry + 1) || 256,
    planes: data.getUint16(entry + 4, true),
    bitCount: data.getUint16(entry + 6, true),
    offset,
    size,
    data: bytes.subarray(offset, offset + size),
  };
}

/** The images an .ico holds, in its directory's order. */
export function icoImages(bytes: Uint8Array): IcoImage[] {
  const data = view(bytes);
  if (
    bytes.length < ICO_HEADER ||
    data.getUint16(0, true) !== 0 ||
    data.getUint16(2, true) !== 1
  ) {
    throw new Error('not an .ico file');
  }
  const count = data.getUint16(4, true);
  return Array.from({ length: count }, (_, index) =>
    icoImage(bytes, ICO_HEADER + index * ICO_ENTRY),
  );
}

/** Where an .ico's first image starts: after its header and directory. */
export function icoImagesStart(count: number): number {
  return ICO_HEADER + count * ICO_ENTRY;
}

export function isSameBytes(
  first: Uint8Array | undefined,
  second: Uint8Array | undefined,
): boolean {
  return (
    first !== undefined &&
    second !== undefined &&
    first.length === second.length &&
    first.every((byte, index) => byte === second[index])
  );
}
