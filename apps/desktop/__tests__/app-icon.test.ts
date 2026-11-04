// The app icon's generated files (scripts/app-icon/run.sh): the macOS asset catalog's AppIcon set and the Windows
// bundle's icons, each a whole PNG at the size its name or entry says, each pixel size drawn once.
import {
  PNG_RGBA,
  type PngInfo,
  icoImages,
  icoImagesStart,
  isSameBytes,
  pngInfo,
  readAppFile,
  readAppText,
} from '../test-support/image-headers';

const APP_ICON_SET = 'macos/GPEditor-macOS/Assets.xcassets/AppIcon.appiconset';
const MAC_POINT_SIZES = [16, 32, 128, 256, 512];
const MAC_SCALES = [1, 2];
/** The Windows bundle's PNGs (tauri.conf.json's bundle.icon) and their pixels; icon.png is the 1024 master. */
const TAURI_PNG_PIXELS: ReadonlyArray<readonly [string, number]> = [
  ['icons/32x32.png', 32],
  ['icons/128x128.png', 128],
  ['icons/128x128@2x.png', 256],
  ['icons/icon.png', 1024],
];
/**
 * The sizes Windows asks an .ico for: Microsoft's minimum (16, 24, 32, 48, 256) and 64 for 400 % title bars — the set
 * `tauri icon` writes, smallest first, each as a PNG as it writes them.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 256];
const ICO_PLANES = 1;
const ICO_BIT_COUNT = 32;

interface AppIconEntry {
  readonly idiom: string;
  readonly size: string;
  readonly scale: string;
  readonly filename?: string;
}

function appIconEntries(): AppIconEntry[] {
  const contents = JSON.parse(readAppText(`${APP_ICON_SET}/Contents.json`)) as { images: AppIconEntry[] };
  return contents.images;
}

function entryPixels(entry: AppIconEntry): number {
  return Number(entry.size.split('x')[0]) * Number(entry.scale.replace('x', ''));
}

/** What a whole 8-bit RGBA PNG of that size reads as. */
function wholePng(pixels: number): PngInfo {
  return { width: pixels, height: pixels, bitDepth: 8, colorType: PNG_RGBA, isComplete: true };
}

function pngAt(relativePath: string): PngInfo | undefined {
  const bytes = readAppFile(relativePath);
  return bytes === undefined ? undefined : pngInfo(bytes);
}

function macFileName(points: number, scale: number): string {
  return `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`;
}

function readIco(): Uint8Array {
  const bytes = readAppFile('src-tauri/icons/icon.ico');
  if (bytes === undefined) {
    throw new Error('src-tauri/icons/icon.ico is missing');
  }
  return bytes;
}

describe('the app icon on macOS', () => {
  const entries = appIconEntries();

  it('lists every point size at 1x and 2x, each with its file', () => {
    // Act
    const listed = entries.map((entry) => [entry.idiom, entry.size, entry.scale, entry.filename]);

    // Assert
    const expected = MAC_POINT_SIZES.flatMap((points) =>
      MAC_SCALES.map((scale) => ['mac', `${points}x${points}`, `${scale}x`, macFileName(points, scale)]),
    );
    expect(listed).toEqual(expected);
  });

  it.each(entries.map((entry) => [entry.filename ?? '(no file)', entryPixels(entry)] as const))(
    'has %s as a whole RGBA PNG of %i pixels',
    (filename, pixels) => {
      // Act
      const png = pngAt(`${APP_ICON_SET}/${filename}`);

      // Assert
      expect(png).toEqual(wholePng(pixels));
    },
  );

  it.each([
    [16, 32],
    [128, 256],
    [256, 512],
  ])('draws %i points at 2x as the same image as %i points at 1x', (points, double) => {
    // Act
    const isSame = isSameBytes(
      readAppFile(`${APP_ICON_SET}/${macFileName(points, 2)}`),
      readAppFile(`${APP_ICON_SET}/${macFileName(double, 1)}`),
    );

    // Assert
    expect(isSame).toBe(true);
  });

  it('names the AppIcon set in Info.plist (CFBundleIconFile and CFBundleIconName)', () => {
    // Arrange
    const plist = readAppText('macos/GPEditor-macOS/Info.plist');

    // Act
    const iconFile = /<key>CFBundleIconFile<\/key>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1];
    const iconName = /<key>CFBundleIconName<\/key>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1];

    // Assert
    expect([iconFile, iconName]).toEqual(['AppIcon', 'AppIcon']);
  });
});

describe('the app icon on Windows', () => {
  it('is bundled as the PNGs and the .ico tauri.conf.json lists', () => {
    // Arrange
    const config = JSON.parse(readAppText('src-tauri/tauri.conf.json')) as { bundle: { icon: string[] } };

    // Act
    const listed = [...config.bundle.icon].sort();

    // Assert
    expect(listed).toEqual([...TAURI_PNG_PIXELS.map(([file]) => file), 'icons/icon.ico'].sort());
  });

  it.each(TAURI_PNG_PIXELS)('has %s as a whole RGBA PNG of %i pixels', (file, pixels) => {
    // Act
    const png = pngAt(`src-tauri/${file}`);

    // Assert
    expect(png).toEqual(wholePng(pixels));
  });

  it('holds whole 16, 24, 32, 48, 64 and 256 pixel PNGs in icon.ico, one after the other to its end', () => {
    // Arrange
    const bytes = readIco();

    // Act
    const images = icoImages(bytes);

    // Assert
    expect(images.map((image) => [image.width, image.height, image.planes, image.bitCount])).toEqual(
      ICO_SIZES.map((pixels) => [pixels, pixels, ICO_PLANES, ICO_BIT_COUNT]),
    );
    expect(images.map((image) => pngInfo(image.data))).toEqual(ICO_SIZES.map(wholePng));
    const ends = images.reduce((offsets, image) => [...offsets, image.offset + image.size], [icoImagesStart(images.length)]);
    expect(images.map((image) => image.offset)).toEqual(ends.slice(0, -1));
    expect(ends[ends.length - 1]).toBe(bytes.length);
  });

  it.each([
    [32, 'icons/32x32.png'],
    [256, 'icons/128x128@2x.png'],
  ])('puts the same %i pixel image in icon.ico as %s', (pixels, file) => {
    // Arrange
    const image = icoImages(readIco()).find((entry) => entry.width === pixels);

    // Act
    const isSame = isSameBytes(image?.data, readAppFile(`src-tauri/${file}`));

    // Assert
    expect(isSame).toBe(true);
  });
});
