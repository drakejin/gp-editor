import { NativeModules } from 'react-native';
import type { PdfDocument } from '../export/pdf-document';
import type { SavedFile } from './gp-files';

interface GPPdfExportModule {
  savePdf(documentJson: string, suggestedName: string): Promise<SavedFile | null>;
}

/**
 * JS side of macos/GPEditor-macOS/GPPdfExport.m: a save panel for a .pdf, then the pages drawn with the score canvas's
 * painter (GPCommandPainter.m).
 */
const native = NativeModules.GPPdfExport as GPPdfExportModule | undefined;

function requireNative(): GPPdfExportModule {
  if (native === undefined) {
    throw new Error('GPPdfExport native module is not available on this platform');
  }
  return native;
}

/** Asks where to save, then writes the document as a PDF; null when the save panel is cancelled. */
export function savePdf(document: PdfDocument, suggestedName: string): Promise<SavedFile | null> {
  return requireNative().savePdf(JSON.stringify(document), suggestedName);
}
