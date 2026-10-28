// Windows twin of recent-files.ts: the list in the app's settings (web/settings.ts) and File ▸ Open Recent in the
// window menu (web/app-menu.ts), in place of user defaults, bookmarks and RecentFilesMenu.swift. Windows needs no
// bookmark to open a file again, so a file is read by its path.
import { type RecentFile, parseRecentFiles } from '../lib/recent-files';
import type { OpenedFile } from './gp-files';
import { readFile } from './gp-files.web';
import { onAppEvent, unsubscribeAll } from './web/app-events';
import { type RecentMenuFile, installMenu } from './web/app-menu';
import { readSetting, writeSetting } from './web/settings';
import { call, fileNameOf, folderOf, isTauri } from './web/tauri';

const SETTINGS_FILE = 'recent-files.json';

/** File ▸ Open Recent's titles: the file name, with its folder when another listed file has the same name. */
export function menuFiles(files: readonly RecentFile[]): RecentMenuFile[] {
  const counts = new Map<string, number>();
  files.forEach((file) => counts.set(file.name, (counts.get(file.name) ?? 0) + 1));
  return files.map((file) => ({
    path: file.path,
    title: (counts.get(file.name) ?? 0) > 1 ? `${file.name} — ${fileNameOf(folderOf(file.path))}` : file.name,
    isPinned: file.isPinned,
    isMissing: file.isMissing,
  }));
}

/** The stored list, each file checked: one that is gone is marked missing (and found again when it is back). */
export async function loadRecentFiles(): Promise<readonly RecentFile[]> {
  const text = await readSetting(SETTINGS_FILE);
  let stored: unknown = [];
  try {
    stored = text === null ? [] : JSON.parse(text);
  } catch {
    stored = [];
  }
  const files = parseRecentFiles(stored);
  if (!isTauri() || files.length === 0) {
    return files;
  }
  const exists = await call<boolean[]>('files_exist', { paths: files.map((file) => file.path) });
  const checked = files.map((file, i) => ({ ...file, isMissing: exists[i] !== true }));
  void installMenu(menuFiles(checked));
  return checked;
}

export async function saveRecentFiles(files: readonly RecentFile[], touchedPath = ''): Promise<void> {
  void touchedPath;
  await writeSetting(SETTINGS_FILE, JSON.stringify(files));
  await installMenu(menuFiles(files));
}

/** Reads a listed file; rejects with code "missing" when it is no longer there (the Rust side's read_file code). */
export function readRecentFile(path: string): Promise<OpenedFile> {
  return readFile(path);
}

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { readonly code?: unknown }).code === 'missing';
}

export function subscribeOpenRecentRequests(onOpenRecent: (path: string) => void): () => void {
  return onAppEvent('openRecentRequested', (body) => {
    const path = typeof body === 'object' && body !== null ? (body as { path?: unknown }).path : undefined;
    if (typeof path === 'string') {
      onOpenRecent(path);
    }
  });
}

export interface RecentListHandlers {
  readonly onClearRequested: () => void;
  readonly onShowRequested: () => void;
}

export function subscribeRecentListRequests(handlers: RecentListHandlers): () => void {
  return unsubscribeAll([onAppEvent('clearRecentRequested', () => handlers.onClearRequested()), onAppEvent('recentFilesRequested', () => handlers.onShowRequested())]);
}
