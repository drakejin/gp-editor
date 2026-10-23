import { type Dispatch, useCallback, useEffect, useRef } from 'react';
import { readSong, writeSong } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import { withoutExtension } from '../lib/file-name';
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
import { type EditorAction, type OpenDocument, isEdited } from '../state/editor';
import { type WorkspaceAction, type WorkspaceState, activeEditor } from '../state/workspace';
import { errorMessage } from '../lib/errors';

/** Each document opens in a new tab (or the tab already holding its file is shown); saving acts on one tab. */
export interface DocumentCommands {
  /** A blank sheet shown as score + tab, score or tab (File ▸ New, New button, start screen). */
  readonly create: (mode: ScoreMode) => void;
  /** Open panel (⌘O, Open button). */
  readonly openDialog: () => void;
  /** Read a file the system handed over (drop, Finder, a finished PDF import); a PDF is imported instead. */
  readonly openPath: (pathOrUrl: string) => void;
  /**
   * A song made in the app (no file holds it yet: `path` is empty, `fileName` is what Save suggests) in a new tab,
   * edited until saved, so closing it asks first.
   */
  readonly openDocument: (document: OpenDocument) => void;
  /** The shown tab: ⌘S overwrites a .gp5 document; anything else, and ⇧⌘S, asks where to save a .gp5 file. */
  readonly save: (saveAs: boolean) => void;
  /** Saves one tab as `save` does; true once it is saved, false when the save panel was cancelled or it failed. */
  readonly saveTab: (tabId: string, saveAs: boolean) => Promise<boolean>;
}

/** "Song.gpx" → "Song.gp5". */
export function gp5Name(fileName: string): string {
  return `${withoutExtension(fileName)}.gp5`;
}

/** Plain Save may overwrite only a file that is already GP5; other formats are saved as a new .gp5. */
export function canOverwrite(path: string): boolean {
  return path.toLowerCase().endsWith('.gp5');
}

/** The default for `onOpenPdf`: one function, so the File-menu listeners are not re-added on every render. */
const IGNORE_PDF = (): void => undefined;

/** True for a PDF path or file URL: opening one imports it (PDF → tab) instead. */
export function isPdfPath(pathOrUrl: string): boolean {
  return pathOrUrl.toLowerCase().endsWith('.pdf');
}

/**
 * New sheets, loading files into tabs (open panel, drag and drop, Finder, File menu), saving a tab, and the window
 * title (the shown tab's file).
 */
export function useDocument(
  workspace: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  onOpenPdf: (pathOrUrl: string) => void = IGNORE_PDF,
): DocumentCommands {
  const open = useOpenFile(dispatch);
  const saveTab = useSaveTab(workspace, dispatch);
  // The shown tab is read through a ref, so the File-menu listener is not re-added on every switch.
  const latest = useRef(workspace);
  latest.current = workspace;
  const save = useCallback(
    (saveAs: boolean) => {
      const { activeTabId } = latest.current;
      if (activeTabId !== undefined) {
        void saveTab(activeTabId, saveAs);
      }
    },
    [saveTab],
  );

  const create = useCallback((mode: ScoreMode) => dispatch({ type: 'created', mode }), [dispatch]);
  const openDocument = useCallback((document: OpenDocument) => dispatch({ type: 'openTab', document, isUnsaved: true }), [dispatch]);
  const openDialog = useCallback(() => {
    void open(showOpenDialog);
  }, [open]);
  const openPath = useCallback(
    (pathOrUrl: string) => {
      if (isPdfPath(pathOrUrl)) {
        onOpenPdf(pathOrUrl);
      } else {
        void open(() => readFile(pathOrUrl));
      }
    },
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

  const editor = activeEditor(workspace);
  const fileName = editor.document?.fileName;
  const edited = isEdited(editor);
  useEffect(() => {
    setDocumentTitle(
      fileName === undefined
        ? 'GP Editor'
        : `${fileName}${edited ? ' — Edited' : ''}`,
    );
  }, [fileName, edited]);

  return { create, openDialog, openPath, openDocument, save, saveTab };
}

/** Reads a file and opens it in a new tab (`loaded`); the window's error banner says why it could not be. */
function useOpenFile(dispatch: Dispatch<WorkspaceAction>): (load: () => Promise<OpenedFile | null>) => Promise<void> {
  return useCallback(
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
        dispatch({ type: 'loadFailed', message: errorMessage(error, 'Unexpected error while opening the file') });
      }
    },
    [dispatch],
  );
}

/** Saving one tab: GP5 bytes to its file or through the save panel; the result goes to that tab (`inTab`). */
function useSaveTab(workspace: WorkspaceState, dispatch: Dispatch<WorkspaceAction>): DocumentCommands['saveTab'] {
  // Reads the latest tabs through a ref, so the File-menu listener does not need re-subscribing per edit.
  const latest = useRef(workspace);
  latest.current = workspace;
  return useCallback(
    async (tabId: string, saveAs: boolean) => {
      const document = latest.current.tabs.find((tab) => tab.id === tabId)?.editor.document;
      if (document === undefined) {
        return false;
      }
      const toTab = (action: EditorAction) => dispatch({ type: 'inTab', tabId, action });
      const { song } = document;
      try {
        const base64 = bytesToBase64(writeSong(song, 'gp5'));
        const saved =
          !saveAs && canOverwrite(document.path)
            ? await writeFile(document.path, base64)
            : await showSaveDialog(base64, gp5Name(document.fileName));
        if (saved === null) {
          return false;
        }
        toTab({ type: 'saved', fileName: saved.name, path: saved.path, song });
        return true;
      } catch (error: unknown) {
        toTab({ type: 'saveFailed', message: errorMessage(error, 'Unexpected error while saving') });
        return false;
      }
    },
    [dispatch],
  );
}
