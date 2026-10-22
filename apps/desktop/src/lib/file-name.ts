/** "Song.gpx" → "Song"; a name without an extension (or a dot file) is kept as it is. */
export function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
