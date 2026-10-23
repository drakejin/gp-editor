import { NativeModules } from 'react-native';
import type { PdfDocument } from '../export/pdf-document';
import { type PngOptions, pngRender } from '../export/png-export';

/** Where the PNG images were saved: their folder and file names (one per page). */
export interface SavedPngs {
  readonly folder: string;
  readonly folderName: string;
  readonly names: readonly string[];
}

interface GPPngExportModule {
  savePngs(documentJson: string, fileNames: readonly string[], scale: number, eraseColor: string): Promise<SavedPngs | null>;
}

/**
 * JS side of macos/GPEditor-macOS/GPPngExport.m: each page drawn with the score canvas's painter (GPCommandPainter.m)
 * into a bitmap, saved as a PNG.
 */
const native = NativeModules.GPPngExport as GPPngExportModule | undefined;

function requireNative(): GPPngExportModule {
  if (native === undefined) {
    throw new Error('GPPngExport native module is not available on this platform');
  }
  return native;
}

/**
 * Asks where to save (a save panel for one page; for several, a folder, since the sandbox lets the app write only
 * what the user chose), then writes page i as `fileNames[i]`; null when cancelled.
 */
export function savePngs(document: PdfDocument, fileNames: readonly string[], options: PngOptions): Promise<SavedPngs | null> {
  const { scale, eraseColor } = pngRender(options);
  return requireNative().savePngs(JSON.stringify(document), fileNames, scale, eraseColor);
}
