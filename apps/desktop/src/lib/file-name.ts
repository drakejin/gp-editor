/** "Song.gpx" → "Song"; a name without an extension (or a dot file) is kept as it is. */
export function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Where the last folder separator is: "/" (macOS) or "\" (Windows); -1 when the path has none. */
function lastSeparator(path: string): number {
  return Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
}

/** "/a/b/Song.gp5" or "C:\a\b\Song.gp5" → "Song.gp5". */
export function baseName(path: string): string {
  return path.slice(lastSeparator(path) + 1);
}

/** "/a/b/Song.gp5" → "/a/b", "C:\a\Song.gp5" → "C:\a"; '' when the path has no folder. */
export function folderName(path: string): string {
  return path.slice(0, Math.max(0, lastSeparator(path)));
}

/** An absolute path: "/…" on macOS, "C:\…" / "C:/…" or "\\server\share\…" on Windows. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}
