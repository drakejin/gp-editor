// Windows twin of pdf-export.ts: the PDF written by web/pdf-writer.ts (pdf-lib), printing through Windows' print
// dialog with the pages as SVG (web/svg-pages.ts).
import type { PdfDocument } from '../export/pdf-document';
import type { SavedFile } from './gp-files';
import { pickSavePath, writePath } from './web/files';
import { loadFonts, musicFontUrl } from './web/fonts';
import { writePdf } from './web/pdf-writer';
import { printableHtml } from './web/svg-pages';

/** Asks where to save, then writes the document as a PDF; null when the save dialog is cancelled. */
export async function savePdf(document: PdfDocument, suggestedName: string): Promise<SavedFile | null> {
  if (document.pages.length === 0) {
    throw new Error('Nothing to export');
  }
  const path = await pickSavePath(suggestedName, [{ name: 'PDF document', extensions: ['pdf'] }], 'Export PDF');
  if (path === null) {
    return null;
  }
  const bytes = await writePdf(document);
  return writePath(/\.pdf$/i.test(path) ? path : `${path}.pdf`, bytes, 'application/pdf');
}

/** Windows' print dialog for the pages; resolves true once the dialog is closed (it does not say whether it printed). */
export async function printPdf(document: PdfDocument): Promise<boolean> {
  if (document.pages.length === 0) {
    throw new Error('Nothing to print');
  }
  await loadFonts();
  const frame = window.document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.visibility = 'hidden';
  frame.srcdoc = printableHtml(document, musicFontUrl());
  window.document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
    const view = frame.contentWindow;
    if (view === null) {
      throw new Error('Could not print the score');
    }
    await view.document.fonts.ready;
    view.focus();
    view.print();
    return true;
  } finally {
    frame.remove();
  }
}
