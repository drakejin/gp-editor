import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import { type ExportMode, buildPdfDocument, exportBaseName, exportStaves, pdfFileName } from '../export/pdf-document';
import { type PngOptions, pngFileNames, pngSavedHint } from '../export/png-export';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { subscribeExportPngRequests, subscribeExportRequests, subscribePrintRequests } from '../native/gp-files';
import { printPdf, savePdf, writePdf } from '../native/pdf-export';
import type { SavedFile } from '../native/gp-files';
import { savePngs } from '../native/png-export';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import type { StaffSpec } from '../score/score-layout';
import type { EditorAction, OpenDocument } from '../state/editor';
import { useStableCallback } from './use-stable-callback';

/** What the export panel saves: a PDF (File ▸ Export PDF…, the Export button) or PNG images (File ▸ Export PNG…). */
export type ExportFormat = 'pdf' | 'png';

export interface PdfExport {
  /** The export panel is shown. */
  readonly isOpen: boolean;
  readonly format: ExportFormat;
  /** The save panel is up or the file is being written. */
  readonly isSaving: boolean;
  /** The Export button and File ▸ Export PDF… (⇧⌘E). Does nothing without a document, like the disabled button. */
  readonly open: () => void;
  /** File ▸ Export PNG…: the panel for PNG images. Does nothing without a document. */
  readonly openPng: () => void;
  readonly close: () => void;
  /** Asks where to save, then writes the PDF of the shown track (tracks) on the stylesheet's page; the panel closes once it is saved. */
  readonly save: (mode: ExportMode) => void;
  /** Asks where to save, then writes the same pages as PNG images, one per page; the hint strip says where they went. */
  readonly savePng: (mode: ExportMode, png: PngOptions) => void;
  /** File ▸ Print… (⌘P): the system print panel for the shown track (tracks) as the view shows it (the stylesheet's pages, fitted to the paper). */
  readonly print: () => void;
  /** The PDF of the shown track (tracks) as the view shows it, written at `path` without a panel (the MCP server's export_file). */
  readonly saveTo: (path: string) => Promise<SavedFile>;
}

/** Runs one save at a time; `write` resolves whether it saved (false: the save panel was cancelled). */
function useSaveRun(onSaved: () => void, onFailed: (message: string) => void): { readonly isSaving: boolean; readonly run: (write: () => Promise<boolean>) => void } {
  const [isSaving, setIsSaving] = useState(false);
  // Guards run() itself: a second press can arrive before the disabled button re-renders.
  const isRunning = useRef(false);
  const run = useCallback(
    (write: () => Promise<boolean>) => {
      if (isRunning.current) {
        return;
      }
      isRunning.current = true;
      setIsSaving(true);
      write()
        .then((isSaved) => isSaved && onSaved())
        .catch((error: unknown) => onFailed(errorMessage(error)))
        .finally(() => {
          isRunning.current = false;
          setIsSaving(false);
        });
    },
    [onSaved, onFailed],
  );
  return { isSaving, run };
}

/** What an export prints: the shown tab's document, track, view and staves. */
interface PrintSource {
  readonly document: OpenDocument;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly chordDisplay: ChordDisplay;
  readonly staves: readonly StaffSpec[];
}

/** The pages of an export as the view shows them (`asShown`) or in one score mode, with the staves and mode they print. */
function exportPages({ document, trackIndex, mode, chordDisplay, staves }: PrintSource, exportMode: ExportMode) {
  const printed = exportStaves(staves, exportMode);
  const trackMode = exportMode === 'asShown' ? mode : exportMode;
  const pdf = buildPdfDocument(document.song, trackIndex, trackMode, { fileName: document.fileName, chordDisplay, staves: printed });
  return { printed, trackMode, pdf };
}

/** The export panel: open for a PDF (File ▸ Export PDF…, the Export button) or PNG images (File ▸ Export PNG…). */
function useExportPanel(hasDocument: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const openAs = useCallback(
    (next: ExportFormat) => {
      setFormat(next);
      setIsOpen(hasDocument);
    },
    [hasDocument],
  );
  const open = useCallback(() => openAs('pdf'), [openAs]);
  const openPng = useCallback(() => openAs('png'), [openAs]);
  const close = useCallback(() => setIsOpen(false), []);
  useEffect(() => subscribeExportRequests(open), [open]);
  useEffect(() => subscribeExportPngRequests(openPng), [openPng]);
  return { isOpen: isOpen && hasDocument, format, open, openPng, close };
}

/**
 * The export panel and saving a PDF or PNG images of the shown track, or of the multitrack view's tracks (`staves`,
 * when it shows several); a failure goes to the error banner (`exportFailed`).
 */
export function usePdfExport(
  document: OpenDocument | undefined,
  trackIndex: number,
  mode: ScoreMode,
  dispatch: Dispatch<EditorAction>,
  chordDisplay: ChordDisplay = DEFAULT_CHORD_DISPLAY,
  staves: readonly StaffSpec[] = [],
): PdfExport {
  const panel = useExportPanel(document !== undefined);
  const { format, close } = panel;
  const onFailed = useCallback(
    (message: string) => dispatch(format === 'png' ? { type: 'exportFailed', message, what: t('window.exportWhat.pngImages') } : { type: 'exportFailed', message }),
    [dispatch, format],
  );
  const { isSaving, run } = useSaveRun(close, onFailed);
  const source = document === undefined ? undefined : { document, trackIndex, mode, chordDisplay, staves };
  const save = useStableCallback((exportMode: ExportMode) => {
    if (source !== undefined) {
      run(async () => {
        const { printed, trackMode, pdf } = exportPages(source, exportMode);
        return (await savePdf(pdf, pdfFileName(source.document.song, trackIndex, trackMode, source.document.fileName, printed))) !== null;
      });
    }
  });
  const savePng = useStableCallback((exportMode: ExportMode, png: PngOptions) => {
    if (source !== undefined) {
      run(async () => {
        const { printed, trackMode, pdf } = exportPages(source, exportMode);
        const names = pngFileNames(exportBaseName(source.document.song, trackIndex, trackMode, source.document.fileName, printed), pdf.pages.length);
        const saved = await savePngs(pdf, names, png);
        if (saved !== null) {
          dispatch({ type: 'showHint', hint: pngSavedHint(saved.names, saved.folderName) });
        }
        return saved !== null;
      });
    }
  });
  const { print, saveTo } = useAsShownOutputs(source, dispatch);
  return { ...panel, isSaving, save, savePng, print, saveTo };
}

/** File ▸ Print… and the MCP server's PDF at a path: the pages as the view shows them. */
function useAsShownOutputs(source: PrintSource | undefined, dispatch: Dispatch<EditorAction>): Pick<PdfExport, 'print' | 'saveTo'> {
  // The same function after every edit, so File ▸ Print…'s listener is added once.
  const print = useStableCallback(() => {
    if (source !== undefined) {
      printPdf(exportPages(source, 'asShown').pdf).catch((error: unknown) => dispatch({ type: 'exportFailed', message: errorMessage(error) }));
    }
  });
  useEffect(() => subscribePrintRequests(print), [print]);
  const saveTo = useStableCallback((path: string) =>
    // i18n-exempt: an MCP client's error, never shown in the app
    source === undefined ? Promise.reject(new Error('No document is open')) : writePdf(exportPages(source, 'asShown').pdf, path),
  );
  return { print, saveTo };
}
