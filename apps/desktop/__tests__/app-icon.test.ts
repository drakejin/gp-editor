// The app icon's generated files (scripts/app-icon/run.sh): the macOS asset catalog's AppIcon set and the Windows
// bundle's icons, each file present at the size its name or entry says.
import {
  PNG_RGBA,
  icoImages,
  pngInfo,
  readAppFile,
  readAppText,
} from '../test-support/image-headers';

const APP_ICON_SET = 'macos/GPEditor-macOS/Assets.xcassets/AppIcon.appiconset';
const MAC_POINT_SIZES = [16, 32, 128, 256, 512];
const MAC_SCALES = [1, 2];
/**
 * The sizes Windows asks an .ico for: Microsoft's minimum (16, 24, 32, 48, 256) and 64 for 400 % title bars — the set
 * `tauri icon` writes, each as a PNG as it writes them.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 256];

interface AppIconEntry {
  readonly idiom: string;
  readonly size: string;
  readonly scale: string;
  readonly filename?: string;
}

function appIconEntries(): AppIconEntry[] {
  const contents = JSON.parse(readAppText(`${APP_ICON_SET}/Contents.json`)) as {
    images: AppIconEntry[];
  };
  return contents.images;
}

function expectRgbaPng(relativePath: string, size: number): void {
  const bytes = readAppFile(relativePath);
  expect(bytes).toBeDefined();
  expect(pngInfo(bytes ?? new Uint8Array())).toEqual({
    width: size,
    height: size,
    colorType: PNG_RGBA,
  });
}

/** The pixel size a Tauri icon's file name says: 32x32.png, 128x128@2x.png; icon.png is the 1024 master. */
function tauriIconSize(file: string): number {
  const match = /(\d+)x\d+(@2x)?\.png$/.exec(file);
  if (!match) {
    return 1024;
  }
  return Number(match[1]) * (match[2] ? 2 : 1);
}

describe('the app icon', () => {
  it('fills every macOS size at 1x and 2x, each file as many pixels as its entry says', () => {
    // Arrange
    const entries = appIconEntries();

    // Act
    const shown = entries.map(entry => `${entry.size}@${entry.scale}`);

    // Assert
    expect(shown).toEqual(
      MAC_POINT_SIZES.flatMap(size =>
        MAC_SCALES.map(scale => `${size}x${size}@${scale}x`),
      ),
    );
    for (const entry of entries) {
      const points = Number(entry.size.split('x')[0]);
      const scale = Number(entry.scale.replace('x', ''));
      expect(entry.idiom).toBe('mac');
      expect(entry.filename).toBeDefined();
      expectRgbaPng(`${APP_ICON_SET}/${entry.filename ?? ''}`, points * scale);
    }
  });

  it('is named by the macOS app as the asset catalog compiles it (AppIcon.icns and the catalog icon)', () => {
    // Arrange
    const plist = readAppText('macos/GPEditor-macOS/Info.plist');

    // Act
    const iconFile =
      /<key>CFBundleIconFile<\/key>\s*<string>([^<]*)<\/string>/.exec(
        plist,
      )?.[1];
    const iconName =
      /<key>CFBundleIconName<\/key>\s*<string>([^<]*)<\/string>/.exec(
        plist,
      )?.[1];

    // Assert
    expect(iconFile).toBe('AppIcon');
    expect(iconName).toBe('AppIcon');
  });

  it('gives the Windows bundle every file tauri.conf.json lists, the PNGs at the sizes their names say', () => {
    // Arrange
    const config = JSON.parse(readAppText('src-tauri/tauri.conf.json')) as {
      bundle: { icon: string[] };
    };

    // Act
    const pngs = config.bundle.icon.filter(file => file.endsWith('.png'));

    // Assert
    expect(config.bundle.icon).toContain('icons/icon.ico');
    expect(pngs).toHaveLength(4);
    for (const file of pngs) {
      expectRgbaPng(`src-tauri/${file}`, tauriIconSize(file));
    }
  });

  it('gives Windows an .ico holding 16, 24, 32, 48, 64 and 256 pixel images', () => {
    // Arrange
    const bytes = readAppFile('src-tauri/icons/icon.ico');
    expect(bytes).toBeDefined();

    // Act
    const images = icoImages(bytes ?? new Uint8Array());

    // Assert
    expect(images.map(image => image.width)).toEqual(ICO_SIZES);
    for (const image of images) {
      expect(image.height).toBe(image.width);
      expect([image.dataWidth, image.dataHeight]).toEqual([
        image.width,
        image.height,
      ]);
      expect(image.format).toBe('png');
    }
  });
});
