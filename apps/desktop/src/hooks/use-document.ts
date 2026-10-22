import { type Dispatch, useCallback, useEffect } from 'react';
import { readSong } from '@gp-editor/core';
import { base64ToBytes } from '../lib/base64';
import { type OpenedFile, readFile, setDocumentTitle, showOpenDialog, subscribeFileEvents } from '../native/gp-files';
import type { EditorAction, EditorState } from '../state/editor';

export interface DocumentCommands {
  /** Open panel (⌘O, Open button). */
  readonly openDialog: () => void;
  /** Read a file the system handed over (drop, Finder). */
  readonly openPath: (pathOrUrl: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error while opening the file';
}

/** Loading files into the editor (open panel, drag and drop, Finder, File ▸ Open…) and the window title. */
export function useDocument(state: EditorState, dispatch: Dispatch<EditorAction>): DocumentCommands {
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
        dispatch({ type: 'loaded', document: { fileName: file.name, path: file.path, song } });
      } catch (error: unknown) {
        dispatch({ type: 'loadFailed', message: errorMessage(error) });
      }
    },
    [dispatch],
  );

  const openDialog = useCallback(() => void open(showOpenDialog), [open]);
  const openPath = useCallback((pathOrUrl: string) => void open(() => readFile(pathOrUrl)), [open]);

  useEffect(() => subscribeFileEvents({ onOpenRequested: openDialog, onFileOpened: openPath }), [openDialog, openPath]);

  const fileName = state.document?.fileName;
  const isEdited = state.past.length > 0;
  useEffect(() => {
    setDocumentTitle(fileName === undefined ? 'GP Editor' : `${fileName}${isEdited ? ' — Edited' : ''}`);
  }, [fileName, isEdited]);

  return { openDialog, openPath };
}
