/**
 * The recent files list (File ▸ Open Recent, the Recent Files panel, the start screen): pinned files on top in the order
 * they were pinned, then the others newest first, one entry per path, at most MAX_RECENT_FILES. The native side
 * (macos/GPEditor-macOS/GPRecentFiles.m) stores it with a security-scoped bookmark per file, so the sandboxed app can
 * open the files again after a relaunch.
 */

/** How many files the list keeps; new files push out the oldest unpinned ones, never a pinned one. */
export const MAX_RECENT_FILES = 20;

export interface RecentFile {
  readonly path: string;
  /** The file name, as File ▸ Open Recent shows it. */
  readonly name: string;
  readonly isPinned: boolean;
  /** When it was last opened or saved (ms since 1970); unpinned files are listed newest first. */
  readonly openedAt: number;
  /** It could not be found the last time it was looked for (deleted, or on a disk that is not mounted). */
  readonly isMissing: boolean;
}

/** A file just opened or saved. */
export interface RecentFileRef {
  readonly path: string;
  readonly name: string;
}

/** Pinned first, in their order; then the others newest first; the first entry of a path wins; at most MAX_RECENT_FILES. */
export function normalizeRecentFiles(files: readonly RecentFile[]): RecentFile[] {
  const unique = files.filter((file, index) => files.findIndex((each) => each.path === file.path) === index);
  const pinned = unique.filter((file) => file.isPinned).slice(0, MAX_RECENT_FILES);
  const others = unique.filter((file) => !file.isPinned).sort((a, b) => b.openedAt - a.openedAt);
  return [...pinned, ...others.slice(0, MAX_RECENT_FILES - pinned.length)];
}

/**
 * A file opened or saved at `openedAt`: the newest of the unpinned files, or still in its place when pinned, and found
 * (no longer missing). `previousPath` names the entry it replaces (the file moved). A file without a path (a sheet never
 * saved) is not listed.
 */
export function rememberRecentFile(files: readonly RecentFile[], file: RecentFileRef, openedAt: number, previousPath?: string): readonly RecentFile[] {
  if (file.path === '') {
    return files;
  }
  const isReplaced = (entry: RecentFile) => entry.path === file.path || (previousPath !== undefined && entry.path === previousPath);
  const existing = files.find((entry) => entry.path === file.path) ?? files.find(isReplaced);
  const entry: RecentFile = { path: file.path, name: file.name, isPinned: existing?.isPinned ?? false, openedAt, isMissing: false };
  if (existing?.isPinned === true) {
    return normalizeRecentFiles(files.flatMap((each) => (each === existing ? [entry] : isReplaced(each) ? [] : [each])));
  }
  const next = normalizeRecentFiles([entry, ...files.filter((each) => !isReplaced(each))]);
  // All MAX_RECENT_FILES files are pinned: nothing changes.
  return next.some((each) => each.path === file.path) ? next : files;
}

/** Pins a file: it goes under the files pinned before it. */
export function pinRecentFile(files: readonly RecentFile[], path: string): readonly RecentFile[] {
  const file = files.find((each) => each.path === path);
  if (file === undefined || file.isPinned) {
    return files;
  }
  const rest = files.filter((each) => each !== file);
  return normalizeRecentFiles([...rest.filter((each) => each.isPinned), { ...file, isPinned: true }, ...rest.filter((each) => !each.isPinned)]);
}

/** Unpins a file: it goes back among the others by when it was last opened. */
export function unpinRecentFile(files: readonly RecentFile[], path: string): readonly RecentFile[] {
  const file = files.find((each) => each.path === path);
  if (file === undefined || !file.isPinned) {
    return files;
  }
  return normalizeRecentFiles(files.map((each) => (each === file ? { ...file, isPinned: false } : each)));
}

export function removeRecentFile(files: readonly RecentFile[], path: string): readonly RecentFile[] {
  return files.filter((each) => each.path !== path);
}

/** File ▸ Open Recent ▸ Clear Menu: every file but the pinned ones goes. */
export function clearRecentFiles(files: readonly RecentFile[]): readonly RecentFile[] {
  return files.filter((each) => each.isPinned);
}

/** The file could not be read: it stays listed, marked missing, until it is removed or found again. */
export function markRecentFileMissing(files: readonly RecentFile[], path: string): readonly RecentFile[] {
  const file = files.find((each) => each.path === path);
  if (file === undefined || file.isMissing) {
    return files;
  }
  return files.map((each) => (each === file ? { ...file, isMissing: true } : each));
}

/** The folder of a file as the lists show it: "~/Music/Tabs" for a home folder, else the full path. */
export function recentFileFolder(path: string): string {
  const folder = path.slice(0, path.lastIndexOf('/'));
  return folder === '' ? '/' : folder.replace(/^\/Users\/[^/]+/, '~');
}

function readRecentFile(value: unknown): RecentFile | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { path, name, isPinned, openedAt, isMissing } = value as Record<string, unknown>;
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return undefined;
  }
  return {
    path,
    name: typeof name === 'string' && name !== '' ? name : path.slice(path.lastIndexOf('/') + 1),
    isPinned: isPinned === true,
    openedAt: typeof openedAt === 'number' && Number.isFinite(openedAt) ? openedAt : 0,
    isMissing: isMissing === true,
  };
}

/** The stored list as the native side returns it (user defaults, so never trusted): well-formed entries, in order. */
export function parseRecentFiles(value: unknown): readonly RecentFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeRecentFiles(value.flatMap((entry: unknown) => readRecentFile(entry) ?? []));
}
