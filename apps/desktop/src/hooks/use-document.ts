import { type Dispatch, useCallback, useEffect, useRef } from 'react';
import { readSongFile } from '@gp-editor/core';
import { songBytesFor, withLoadedAudio } from '../lib/audio-track-files';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import { SAVE_FORMATS, type SaveFormat, defaultSaveFormat, fileNameIn, saveFormatOf, saveHint } from '../lib/file-formats';
import {
  type OpenedFile,
  readFile,
  setDocumentTitle,
  showOpenDialog,
  showSavePanel,
  subscribeFileEvents,
  writeFile,
} from '../native/gp-files';
import { isMissingFileError, readRecentFile, subscribeOpenRecentRequests } from '../native/recent-files';
import type { RecentFileRef } from '../lib/recent-files';
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
  /** A file of the recent files list (File ▸ Open Recent, the Recent Files list), read through its bookmark. */
  readonly openRecent: (path: string) => void;
  /**
   * A song made in the app (no file holds it yet: `path` is empty, `fileName` is what Save suggests) in a new tab,
   * edited until saved, so closing it asks first.
   */
  readonly openDocument: (document: OpenDocument) => void;
  /**
   * The shown tab: ⌘S overwrites a file in its own format when the app writes it (`SAVE_FORMATS`: .gp5, .gp4, .gp3);
   * anything else, and ⇧⌘S, asks where and in which format to save.
   */
  readonly save: (saveAs: boolean) => void;
  /** Saves one tab as `save` does; true once it is saved, false when the save panel was cancelled or it failed. */
  readonly saveTab: (tabId: string, saveAs: boolean) => Promise<boolean>;
}

/** The default for `onOpenPdf`: one function, so the File-menu listeners are not re-added on every render. */
const IGNORE_PDF = (): void => undefined;

/** What the recent files list hears from opening and saving (useRecentFiles). */
export interface RecentFileHandlers {
  /** A file was opened or saved; `previousPath` is where a recent file was before it moved. */
  readonly remember: (file: RecentFileRef, previousPath?: string) => void;
  /** A recent file could not be found. */
  readonly markMissing: (path: string) => void;
}

const NO_RECENT_FILES: RecentFileHandlers = { remember: () => undefined, markMissing: () => undefined };

/** True for a PDF path or file URL: opening one imports it (PDF → tab) instead. */
export function isPdfPath(pathOrUrl: string): boolean {
  return pathOrUrl.toLowerCase().endsWith('.pdf');
}

/**
 * New sheets, loading files into tabs (open panel, drag and drop, Finder, File menu, the recent files), saving a tab,
 * and the window title (the shown tab's file). Every file opened or saved goes to `recentFiles`.
 */
export function useDocument(
  workspace: WorkspaceState,
  dispatch: Dispatch<WorkspaceAction>,
  onOpenPdf: (pathOrUrl: string) => void = IGNORE_PDF,
  recentFiles: RecentFileHandlers = NO_RECENT_FILES,
): DocumentCommands {
  const open = useOpenFile(dispatch, recentFiles);
  const saveTab = useSaveTab(workspace, dispatch, recentFiles);
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
  const openRecent = useCallback(
    (path: string) => {
      void open(() => readRecentFile(path), path);
    },
    [open],
  );
  useEffect(() => subscribeOpenRecentRequests(openRecent), [openRecent]);

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

  return { create, openDialog, openPath, openRecent, openDocument, save, saveTab };
}

/**
 * Reads a file and opens it in a new tab (`loaded`), then remembers it as a recent file; the window's error banner
 * says why it could not be. `recentPath`: the recent file being opened (marked missing when it is gone).
 */
function useOpenFile(
  dispatch: Dispatch<WorkspaceAction>,
  recentFiles: RecentFileHandlers,
): (load: () => Promise<OpenedFile | null>, recentPath?: string) => Promise<void> {
  const { remember, markMissing } = recentFiles;
  return useCallback(
    async (load: () => Promise<OpenedFile | null>, recentPath?: string) => {
      dispatch({ type: 'loadStarted' });
      try {
        const file = await load();
        if (file === null) {
          dispatch({ type: 'loadCancelled' });
          return;
        }
        const { song, hint } = await withLoadedAudio(readSongFile(base64ToBytes(file.base64)));
        dispatch({ type: 'loaded', document: { fileName: file.name, path: file.path, song } });
        if (hint !== undefined) {
          dispatch({ type: 'showHint', hint });
        }
        remember({ path: file.path, name: file.name }, recentPath !== undefined && recentPath !== file.path ? recentPath : undefined);
      } catch (error: unknown) {
        if (recentPath !== undefined && isMissingFileError(error)) {
          markMissing(recentPath);
        }
        dispatch({ type: 'loadFailed', message: errorMessage(error, 'Unexpected error while opening the file') });
      }
    },
    [dispatch, remember, markMissing],
  );
}

/** Where to write: the document's own file in its format (plain Save), else the save panel's choice; null when cancelled. */
async function chooseDestination(document: OpenDocument, saveAs: boolean): Promise<{ readonly path: string; readonly format: SaveFormat } | null> {
  const ownFormat = saveAs ? undefined : saveFormatOf(document.path);
  if (ownFormat !== undefined) {
    return { path: document.path, format: ownFormat };
  }
  const preselected = defaultSaveFormat(document.path);
  const chosen = await showSavePanel({ suggestedName: fileNameIn(document.fileName, preselected), formats: SAVE_FORMATS, formatId: preselected.id });
  if (chosen === null) {
    return null;
  }
  return { path: chosen.path, format: SAVE_FORMATS.find((format) => format.id === chosen.formatId) ?? SAVE_FORMATS[0] };
}

/**
 * Saving one tab: its song in the chosen Guitar Pro format, to its file or through the save panel; what the format
 * cannot hold goes to the hint bar before it is written, and the result to that tab (`inTab`) and the recent files.
 */
function useSaveTab(workspace: WorkspaceState, dispatch: Dispatch<WorkspaceAction>, recentFiles: RecentFileHandlers): DocumentCommands['saveTab'] {
  const { remember } = recentFiles;
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
        const destination = await chooseDestination(document, saveAs);
        if (destination === null) {
          return false;
        }
        const { path, format } = destination;
        const written = await songBytesFor(song, format.id);
        const hint = [saveHint(format, song), written.hint].filter((part) => part !== undefined).join(' ');
        if (hint !== '') {
          toTab({ type: 'showHint', hint });
        }
        const saved = await writeFile(path, bytesToBase64(written.bytes));
        toTab({ type: 'saved', fileName: saved.name, path: saved.path, song });
        remember({ path: saved.path, name: saved.name });
        return true;
      } catch (error: unknown) {
        toTab({ type: 'saveFailed', message: errorMessage(error, 'Unexpected error while saving') });
        return false;
      }
    },
    [dispatch, remember],
  );
}
