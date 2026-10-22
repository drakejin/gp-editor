import { type Dispatch, useCallback, useEffect, useRef } from 'react';
import { readSong, writeSong } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import {
  type OpenedFile,
  readFile,
  setDocumentTitle,
  showOpenDialog,
  showSaveDialog,
  subscribeFileEvents,
  writeFile,
} from '../native/gp-files';
import type { ScoreMode } from '../score/geometry';
import { type EditorAction, type EditorState, isEdited } from '../state/editor';

export interface DocumentCommands {
  /** A blank sheet shown as score + tab, score or tab (File ▸ New, New button, start screen). */
  readonly create: (mode: ScoreMode) => void;
  /** Open panel (⌘O, Open button). */
  readonly openDialog: () => void;
  /** Read a file the system handed over (drop, Finder); a PDF is imported instead. */
  readonly openPath: (pathOrUrl: string) => void;
  /** ⌘S overwrites a .gp5 document; anything else, and ⇧⌘S, asks where to save a .gp5 file. */
  readonly save: (saveAs: boolean) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** "Song.gpx" → "Song.gp5". */
export function gp5Name(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return `${dot > 0 ? fileName.slice(0, dot) : fileName}.gp5`;
}

/** Plain Save may overwrite only a file that is already GP5; other formats are saved as a new .gp5. */
export function canOverwrite(path: string): boolean {
  return path.toLowerCase().endsWith('.gp5');
}

/** New sheets, loading and saving files (open panel, drag and drop, Finder, File menu) and the window title. */
/** True for a PDF path or file URL: opening one imports it (PDF → tab) instead. */
export function isPdfPath(pathOrUrl: string): boolean {
  return pathOrUrl.toLowerCase().endsWith('.pdf');
}

export function useDocument(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  onOpenPdf: (pathOrUrl: string) => void = () => undefined,
): DocumentCommands {
  const open = useCallback(
    async (load: () => Promise<OpenedFile | null>) => {
      dispatch({ type: 'loadStarted' });
      try {
        const file = await load();
        if (file === null) {
          dispatch({ type: 'loadCancelled' });
          return;
        }
        const song = readSong(base64ToBytes(file.base64));
        dispatch({
          type: 'loaded',
          document: { fileName: file.name, path: file.path, song },
        });
      } catch (error: unknown) {
        dispatch({
          type: 'loadFailed',
          message: errorMessage(
            error,
            'Unexpected error while opening the file',
          ),
        });
      }
    },
    [dispatch],
  );

  // Save reads the latest state through a ref so the File-menu listener does not need re-subscribing per edit.
  const latest = useRef(state);
  latest.current = state;
  const save = useCallback(
    (saveAs: boolean) => {
      const document = latest.current.document;
      if (document === undefined) {
        return;
      }
      const { song } = document;
      void (async () => {
        try {
          const base64 = bytesToBase64(writeSong(song, 'gp5'));
          const saved =
            !saveAs && canOverwrite(document.path)
              ? await writeFile(document.path, base64)
              : await showSaveDialog(base64, gp5Name(document.fileName));
          if (saved !== null) {
            dispatch({
              type: 'saved',
              fileName: saved.name,
              path: saved.path,
              song,
            });
          }
        } catch (error: unknown) {
          dispatch({
            type: 'saveFailed',
            message: errorMessage(error, 'Unexpected error while saving'),
          });
        }
      })();
    },
    [dispatch],
  );

  const create = useCallback((mode: ScoreMode) => dispatch({ type: 'created', mode }), [dispatch]);
  const openDialog = useCallback(() => void open(showOpenDialog), [open]);
  const openPath = useCallback(
    (pathOrUrl: string) =>
      isPdfPath(pathOrUrl)
        ? onOpenPdf(pathOrUrl)
        : void open(() => readFile(pathOrUrl)),
    [open, onOpenPdf],
  );

  useEffect(
    () =>
      subscribeFileEvents({
        onNewRequested: create,
        onOpenRequested: openDialog,
        onFileOpened: openPath,
        onSaveRequested: save,
      }),
    [create, openDialog, openPath, save],
  );

  const fileName = state.document?.fileName;
  const edited = isEdited(state);
  useEffect(() => {
    setDocumentTitle(
      fileName === undefined
        ? 'GP Editor'
        : `${fileName}${edited ? ' — Edited' : ''}`,
    );
  }, [fileName, edited]);

  return { create, openDialog, openPath, save };
}
