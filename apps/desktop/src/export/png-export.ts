import { t } from '../lib/i18n/i18n';
import { PRINT_PALETTE } from './paper';

/**
 * PNG export (File ▸ Export PNG…): the PDF export's pages (`buildPdfDocument`), each drawn by the native side
 * (macos/GPEditor-macOS/GPPngExport.m) with the same painter into an image of its own.
 */

/** Resolutions offered, in dots per inch. A page is measured in points (1/72 inch): 72 dpi is one pixel per point. */
export type PngResolution = 72 | 150 | 300;

export const PNG_RESOLUTIONS: readonly PngResolution[] = [72, 150, 300];

export interface PngOptions {
  readonly dpi: PngResolution;
  /** No paper: transparent wherever nothing is drawn (the gaps in the tab lines behind fret numbers too); else a white page. */
  readonly isTransparent: boolean;
}

export const DEFAULT_PNG_OPTIONS: PngOptions = { dpi: 150, isTransparent: false };

/** How the native side draws the pages: pixels per point, and the colour that erases instead of painting ('' for none). */
export interface PngRender {
  readonly scale: number;
  readonly eraseColor: string;
}

const POINTS_PER_INCH = 72;

/**
 * One file per page: "<name>.png" for a single page, else "<name>-1.png" … "<name>-N.png", the numbers padded
 * ("-01" … "-12") so the files sort in page order.
 */
export function pngFileNames(baseName: string, pageCount: number): string[] {
  if (pageCount === 1) {
    return [`${baseName}.png`];
  }
  const digits = String(pageCount).length;
  return Array.from({ length: pageCount }, (_, i) => `${baseName}-${String(i + 1).padStart(digits, '0')}.png`);
}

/** A page's size in pixels at a resolution: its points × dpi / 72, rounded (what GPPngExport.m makes). */
export function pngPixelSize(page: { readonly width: number; readonly height: number }, dpi: number): { width: number; height: number } {
  const scale = dpi / POINTS_PER_INCH;
  return { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
}

/**
 * The paper's colour fills the page and the boxes that break the tab lines behind fret numbers; on a transparent
 * background those erase what is under them instead, so the gaps stay and no white box is left.
 */
export function pngRender(options: PngOptions): PngRender {
  return { scale: options.dpi / POINTS_PER_INCH, eraseColor: options.isTransparent ? PRINT_PALETTE.paper : '' };
}

/** "Song.png", "Song-1.png, Song-2.png" or "Song-1.png … Song-3.png". */
export function pngFilesText(names: readonly string[]): string {
  return names.length > 2 ? `${names[0] ?? ''} … ${names.at(-1) ?? ''}` : names.join(', ');
}

/** The hint after a PNG export: what was saved, in which folder. */
export function pngSavedHint(names: readonly string[], folderName: string): string {
  if (names.length === 1) {
    return t('window.pngExport.savedOne', { name: names[0] ?? '', folder: folderName });
  }
  return t('window.pngExport.savedMany', { count: names.length, folder: folderName, files: pngFilesText(names) });
}
