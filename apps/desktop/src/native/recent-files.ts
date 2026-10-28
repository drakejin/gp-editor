import { NativeModules } from 'react-native';
import { type RecentFile, parseRecentFiles } from '../lib/recent-files';
import type { OpenedFile } from './gp-files';
import { subscribeNativeEvents } from './native-events';

interface GPRecentFilesModule {
  loadRecentFiles(): Promise<unknown>;
  saveRecentFiles(filesJson: string, touchedPath: string): Promise<void>;
  readRecentFile(path: string): Promise<OpenedFile>;
}

/**
 * JS side of macos/GPEditor-macOS/GPRecentFiles.m: the recent files list in user defaults (File ▸ Open Recent reads it
 * there), a security-scoped bookmark per file, and the Open Recent menu's events.
 */
const native = NativeModules.GPRecentFiles as GPRecentFilesModule | undefined;

function requireNative(): GPRecentFilesModule {
  if (native === undefined) {
    // i18n-exempt: a developer's diagnostic naming the native module
    throw new Error('GPRecentFiles native module is not available on this platform');
  }
  return native;
}

/** The stored list, each file checked (moved files followed, missing ones marked). */
export async function loadRecentFiles(): Promise<readonly RecentFile[]> {
  return parseRecentFiles(await requireNative().loadRecentFiles());
}

/** Stores the list (and updates File ▸ Open Recent); `touchedPath`, a file just opened or saved, is bookmarked afresh. */
export function saveRecentFiles(files: readonly RecentFile[], touchedPath = ''): Promise<void> {
  return requireNative().saveRecentFiles(JSON.stringify(files), touchedPath);
}

/** Reads a listed file through its bookmark (the sandbox's permission from when it was opened); rejects "missing" when it is gone. */
export function readRecentFile(path: string): Promise<OpenedFile> {
  return requireNative().readRecentFile(path);
}

/** True for readRecentFile's rejection of a file that is no longer there. */
export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { readonly code?: unknown }).code === 'missing';
}

/** File ▸ Open Recent ▸ a file; returns the unsubscribe function. */
export function subscribeOpenRecentRequests(onOpenRecent: (path: string) => void): () => void {
  return subscribeNativeEvents(native, {
    openRecentRequested: (event?: { readonly path?: unknown }) => {
      if (typeof event?.path === 'string') {
        onOpenRecent(event.path);
      }
    },
  });
}

export interface RecentListHandlers {
  /** File ▸ Open Recent ▸ Clear Menu. */
  readonly onClearRequested: () => void;
  /** File ▸ Recent Files…. */
  readonly onShowRequested: () => void;
}

/** Clear Menu and Recent Files…; returns the unsubscribe function. */
export function subscribeRecentListRequests(handlers: RecentListHandlers): () => void {
  return subscribeNativeEvents(native, { clearRecentRequested: handlers.onClearRequested, recentFilesRequested: handlers.onShowRequested });
}
