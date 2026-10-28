// Windows twin of pdf-export.ts: the PDF written by web/pdf-writer.ts (pdf-lib), printing through Windows' print
// dialog with the pages as SVG (web/svg-pages.ts).
import type { PdfDocument } from '../export/pdf-document';
import { t } from '../lib/i18n/i18n';
import type { SavedFile } from './gp-files';
import { pickSavePath, writePath } from './web/files';
import { loadFonts, musicFontUrl } from './web/fonts';
import { writePdf as pdfBytes } from './web/pdf-writer';
import { printableHtml } from './web/svg-pages';

/** Asks where to save, then writes the document as a PDF; null when the save dialog is cancelled. */
export async function savePdf(document: PdfDocument, suggestedName: string): Promise<SavedFile | null> {
  if (document.pages.length === 0) {
    throw new Error(t('window.windows.nothingToExport'));
  }
  const path = await pickSavePath(suggestedName, [{ name: t('window.windows.pdfFilter'), extensions: ['pdf'] }], t('window.windows.exportPdfTitle'));
  if (path === null) {
    return null;
  }
  return writePdf(document, /\.pdf$/i.test(path) ? path : `${path}.pdf`);
}

/** Writes the document as a PDF at `path`, without a dialog. */
export async function writePdf(document: PdfDocument, path: string): Promise<SavedFile> {
  return writePath(path, await pdfBytes(document), 'application/pdf');
}

/** Windows' print dialog for the pages; resolves true once the dialog is closed (it does not say whether it printed). */
export async function printPdf(document: PdfDocument): Promise<boolean> {
  if (document.pages.length === 0) {
    throw new Error(t('window.windows.nothingToPrint'));
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
      throw new Error(t('window.windows.printFailed'));
    }
    await view.document.fonts.ready;
    view.focus();
    view.print();
    return true;
  } finally {
    frame.remove();
  }
}
