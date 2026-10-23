import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
  type RecentFile,
  type RecentFileRef,
  clearRecentFiles,
  markRecentFileMissing,
  pinRecentFile,
  rememberRecentFile,
  removeRecentFile,
  unpinRecentFile,
} from '../lib/recent-files';
import { loadRecentFiles, saveRecentFiles, subscribeRecentListRequests } from '../native/recent-files';

export interface RecentFiles {
  /** Pinned files first, then the others newest first (lib/recent-files.ts). */
  readonly files: readonly RecentFile[];
  /** What the last read or write of the stored list could not do. */
  readonly error?: string;
  /** The Recent Files panel (File ▸ Recent Files…) is shown. */
  readonly isPanelOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
  /** A file was opened or saved: it goes on top (a pinned one keeps its place). `previousPath`: where it was before it moved. */
  readonly remember: (file: RecentFileRef, previousPath?: string) => void;
  readonly togglePin: (path: string) => void;
  readonly remove: (path: string) => void;
  /** Every file but the pinned ones goes (File ▸ Open Recent ▸ Clear Menu, the panel's Clear). */
  readonly clear: () => void;
  /** The file could not be found when opened from the list. */
  readonly markMissing: (path: string) => void;
  readonly dismissError: () => void;
}

type RecentChange = (files: readonly RecentFile[]) => readonly RecentFile[];

interface QueuedChange {
  readonly change: RecentChange;
  readonly touchedPath: string;
}

/**
 * The recent files list, kept by the native side across launches (GPRecentFiles.m, which also builds File ▸ Open
 * Recent from it). Each change is stored at once; changes made before the stored list arrived (a file Finder opened at
 * launch) are applied to it when it does. `now` stamps a file as opened (ms since 1970).
 */
export function useRecentFiles(now: () => number = Date.now): RecentFiles {
  const [files, setFiles] = useState<readonly RecentFile[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // The list as last changed, read synchronously so quick changes build on each other; undefined until it is loaded.
  const latest = useRef<readonly RecentFile[] | undefined>(undefined);
  const queued = useRef<readonly QueuedChange[]>([]);

  const apply = useCallback(({ change, touchedPath }: QueuedChange) => {
    const current = latest.current ?? [];
    const next = change(current);
    if (next === current) {
      return;
    }
    latest.current = next;
    setFiles(next);
    saveRecentFiles(next, touchedPath).catch((reason: unknown) => setError(errorMessage(reason, 'The recent files could not be kept')));
  }, []);
  const update = useCallback(
    (change: RecentChange, touchedPath = '') => {
      if (latest.current === undefined) {
        queued.current = [...queued.current, { change, touchedPath }];
      } else {
        apply({ change, touchedPath });
      }
    },
    [apply],
  );

  useEffect(() => {
    const start = (loaded: readonly RecentFile[]) => {
      latest.current = loaded;
      setFiles(loaded);
      const pending = queued.current;
      queued.current = [];
      pending.forEach(apply);
    };
    loadRecentFiles()
      .then(start)
      .catch((reason: unknown) => {
        setError(errorMessage(reason, 'The recent files could not be read'));
        start([]);
      });
  }, [apply]);

  const remember = useCallback(
    (file: RecentFileRef, previousPath?: string) => update((list) => rememberRecentFile(list, file, now(), previousPath), file.path),
    [update, now],
  );
  const togglePin = useCallback(
    (path: string) => update((list) => (list.find((file) => file.path === path)?.isPinned === true ? unpinRecentFile(list, path) : pinRecentFile(list, path))),
    [update],
  );
  const remove = useCallback((path: string) => update((list) => removeRecentFile(list, path)), [update]);
  const clear = useCallback(() => update(clearRecentFiles), [update]);
  const markMissing = useCallback((path: string) => update((list) => markRecentFileMissing(list, path)), [update]);
  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const dismissError = useCallback(() => setError(undefined), []);
  useEffect(() => subscribeRecentListRequests({ onClearRequested: clear, onShowRequested: openPanel }), [clear, openPanel]);

  return { files, error, isPanelOpen, openPanel, closePanel, remember, togglePin, remove, clear, markMissing, dismissError };
}
