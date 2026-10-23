import { type Dispatch, useCallback, useEffect, useRef, useState } from 'react';
import type { PaperId } from '../export/paper';
import { buildPdfDocument, pdfFileName } from '../export/pdf-document';
import { errorMessage } from '../lib/errors';
import { subscribeExportRequests, subscribePrintRequests } from '../native/gp-files';
import { printPdf, savePdf } from '../native/pdf-export';
import { type ChordDisplay, DEFAULT_CHORD_DISPLAY } from '../score/chords';
import type { ScoreMode } from '../score/geometry';
import type { EditorAction, OpenDocument } from '../state/editor';

export interface PdfExport {
  /** The export panel is shown. */
  readonly isOpen: boolean;
  /** The save panel is up or the PDF is being written. */
  readonly isSaving: boolean;
  /** The Export button and File ▸ Export PDF… (⇧⌘E). Does nothing without a document, like the disabled button. */
  readonly open: () => void;
  readonly close: () => void;
  /** Asks where to save, then writes the PDF of the shown track; the panel closes once it is saved. */
  readonly save: (mode: ScoreMode, paper: PaperId) => void;
  /** File ▸ Print… (⌘P): the system print panel for the shown track in the view's mode (A4 pages, fitted to the paper). */
  readonly print: () => void;
}

/** Pages printing lays out; the print panel fits them to the chosen paper. */
const PRINT_PAPER: PaperId = 'a4';

/** The export panel and saving a PDF of the shown track; a failure goes to the error banner (`exportFailed`). */
export function usePdfExport(
  document: OpenDocument | undefined,
  trackIndex: number,
  mode: ScoreMode,
  dispatch: Dispatch<EditorAction>,
  chordDisplay: ChordDisplay = DEFAULT_CHORD_DISPLAY,
): PdfExport {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Guards save() itself: a second press can arrive before the disabled button re-renders.
  const isSaveRunning = useRef(false);
  const hasDocument = document !== undefined;
  const open = useCallback(() => setIsOpen(hasDocument), [hasDocument]);
  const close = useCallback(() => setIsOpen(false), []);
  useEffect(() => subscribeExportRequests(open), [open]);

  const save = useCallback(
    (exportMode: ScoreMode, paper: PaperId) => {
      if (document === undefined || isSaveRunning.current) {
        return;
      }
      isSaveRunning.current = true;
      setIsSaving(true);
      void (async () => {
        try {
          const pdf = buildPdfDocument(document.song, trackIndex, exportMode, { paper, fileName: document.fileName, chordDisplay });
          const saved = await savePdf(pdf, pdfFileName(document.song, trackIndex, exportMode, document.fileName));
          if (saved !== null) {
            setIsOpen(false);
          }
        } catch (error: unknown) {
          dispatch({ type: 'exportFailed', message: errorMessage(error) });
        } finally {
          isSaveRunning.current = false;
          setIsSaving(false);
        }
      })();
    },
    [document, trackIndex, dispatch, chordDisplay],
  );

  const print = useCallback(() => {
    if (document === undefined) {
      return;
    }
    const pdf = buildPdfDocument(document.song, trackIndex, mode, { paper: PRINT_PAPER, fileName: document.fileName, chordDisplay });
    printPdf(pdf).catch((error: unknown) => dispatch({ type: 'exportFailed', message: errorMessage(error) }));
  }, [document, trackIndex, mode, dispatch, chordDisplay]);
  useEffect(() => subscribePrintRequests(print), [print]);

  return { isOpen: isOpen && hasDocument, isSaving, open, close, save, print };
}
