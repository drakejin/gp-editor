import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { PaperId } from '../export/paper';
import { buildPdfDocument, exportBaseName, pdfFileName } from '../export/pdf-document';
import { type PngOptions, pngFileNames, pngSavedHint } from '../export/png-export';
import { errorMessage } from '../lib/errors';
import { subscribeExportPngRequests, subscribeExportRequests, subscribePrintRequests } from '../native/gp-files';
import { printPdf, savePdf } from '../native/pdf-export';
import { savePngs } from '../native/png-export';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import type { EditorAction, OpenDocument } from '../state/editor';

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
  /** Asks where to save, then writes the PDF of the shown track; the panel closes once it is saved. */
  readonly save: (mode: ScoreMode, paper: PaperId) => void;
  /** Asks where to save, then writes the same pages as PNG images, one per page; the hint strip says where they went. */
  readonly savePng: (mode: ScoreMode, paper: PaperId, png: PngOptions) => void;
  /** File ▸ Print… (⌘P): the system print panel for the shown track in the view's mode (A4 pages, fitted to the paper). */
  readonly print: () => void;
}

/** Pages printing lays out; the print panel fits them to the chosen paper. */
const PRINT_PAPER: PaperId = 'a4';

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

/** The export panel and saving a PDF or PNG images of the shown track; a failure goes to the error banner (`exportFailed`). */
export function usePdfExport(
  document: OpenDocument | undefined,
  trackIndex: number,
  mode: ScoreMode,
  dispatch: Dispatch<EditorAction>,
  chordDisplay: ChordDisplay = DEFAULT_CHORD_DISPLAY,
): PdfExport {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const hasDocument = document !== undefined;
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
  const onFailed = useCallback(
    (message: string) => dispatch(format === 'png' ? { type: 'exportFailed', message, what: 'the PNG images' } : { type: 'exportFailed', message }),
    [dispatch, format],
  );
  const { isSaving, run } = useSaveRun(close, onFailed);

  const save = useCallback(
    (exportMode: ScoreMode, paper: PaperId) => {
      if (document !== undefined) {
        run(async () => {
          const pdf = buildPdfDocument(document.song, trackIndex, exportMode, { paper, fileName: document.fileName, chordDisplay });
          return (await savePdf(pdf, pdfFileName(document.song, trackIndex, exportMode, document.fileName))) !== null;
        });
      }
    },
    [document, trackIndex, run, chordDisplay],
  );

  const savePng = useCallback(
    (exportMode: ScoreMode, paper: PaperId, png: PngOptions) => {
      if (document !== undefined) {
        run(async () => {
          const pages = buildPdfDocument(document.song, trackIndex, exportMode, { paper, fileName: document.fileName, chordDisplay });
          const names = pngFileNames(exportBaseName(document.song, trackIndex, exportMode, document.fileName), pages.pages.length);
          const saved = await savePngs(pages, names, png);
          if (saved !== null) {
            dispatch({ type: 'showHint', hint: pngSavedHint(saved.names, saved.folderName) });
          }
          return saved !== null;
        });
      }
    },
    [document, trackIndex, run, dispatch, chordDisplay],
  );

  const print = useCallback(() => {
    if (document === undefined) {
      return;
    }
    const pdf = buildPdfDocument(document.song, trackIndex, mode, { paper: PRINT_PAPER, fileName: document.fileName, chordDisplay });
    printPdf(pdf).catch((error: unknown) => dispatch({ type: 'exportFailed', message: errorMessage(error) }));
  }, [document, trackIndex, mode, dispatch, chordDisplay]);
  useEffect(() => subscribePrintRequests(print), [print]);

  return { isOpen: isOpen && hasDocument, format, isSaving, open, openPng, close, save, savePng, print };
}
