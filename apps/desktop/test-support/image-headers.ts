// Reads the headers of the app icon's files in Jest: a PNG's size and colour type, the images an .ico holds. The app's
// tsconfig has no Node types (see fixtures.ts), so the two Node modules used here are declared locally.
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
/** PNG colour type 6: red, green, blue and alpha. */
export const PNG_RGBA = 6;

export interface PngInfo {
  readonly width: number;
  readonly height: number;
  readonly colorType: number;
}

/** One image in an .ico's directory; `format` is how its bytes are stored. */
export interface IcoImage {
  readonly width: number;
  readonly height: number;
  readonly format: 'png' | 'bmp';
  readonly dataWidth: number;
  readonly dataHeight: number;
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

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Width, height and colour type from a PNG's IHDR chunk; undefined for anything else. */
export function pngInfo(bytes: Uint8Array): PngInfo | undefined {
  if (bytes.length < 26 || !isPng(bytes)) {
    return undefined;
  }
  const data = view(bytes);
  return {
    width: data.getUint32(16),
    height: data.getUint32(20),
    colorType: data.getUint8(25),
  };
}

/** The image a directory entry points at: a PNG, or a BMP's BITMAPINFOHEADER (its height counts the AND mask too). */
function icoImage(bytes: Uint8Array, entry: number): IcoImage {
  const data = view(bytes);
  const width = data.getUint8(entry) || 256;
  const height = data.getUint8(entry + 1) || 256;
  const size = data.getUint32(entry + 8, true);
  const offset = data.getUint32(entry + 12, true);
  if (offset + size > bytes.length) {
    throw new Error(
      `an .ico image runs past the file's end (${offset} + ${size} > ${bytes.length})`,
    );
  }
  const image = bytes.subarray(offset, offset + size);
  const png = pngInfo(image);
  if (png) {
    return {
      width,
      height,
      format: 'png',
      dataWidth: png.width,
      dataHeight: png.height,
    };
  }
  const header = view(image);
  return {
    width,
    height,
    format: 'bmp',
    dataWidth: header.getInt32(4, true),
    dataHeight: header.getInt32(8, true) / 2,
  };
}

/** The images an .ico holds, in its directory's order. */
export function icoImages(bytes: Uint8Array): IcoImage[] {
  const data = view(bytes);
  if (data.getUint16(0, true) !== 0 || data.getUint16(2, true) !== 1) {
    throw new Error('not an .ico file');
  }
  const count = data.getUint16(4, true);
  return Array.from({ length: count }, (_, index) =>
    icoImage(bytes, 6 + index * 16),
  );
}
