// Version string of a GPIF document (no TuxGuitar counterpart: TuxGuitar does not report it).
import type { GpifDocument } from './gpif-document';

/** "<GPVersion or fallback> r<GPRevision>", e.g. "8.1.4 r13007", "7 r12020", "r11686" (GP6 has no GPVersion). */
export function gpifVersionString(doc: GpifDocument, fallbackVersion: string | undefined): string {
  const version = doc.gpVersion ?? fallbackVersion;
  const revision = doc.gpRevision === undefined ? undefined : `r${doc.gpRevision}`;
  return [version, revision].filter((part): part is string => part !== undefined && part !== '').join(' ');
}
