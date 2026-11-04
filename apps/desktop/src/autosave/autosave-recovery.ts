// The autosaved work there is to bring back: what the launch question offers (the unsaved work of sessions that ended
// without saving or letting it go — a crash, a force quit, a power cut) and what File ▸ Recover Autosaved Work… lists.
import { isDayName, isFolderId } from './autosave-days';
import { type AutosaveManifest, type AutosaveSession, type AutosaveStatus, parseManifest } from './autosave-manifest';

/** Documents listed at most. */
export const MAX_LISTED_WORK = 50;

/** A snapshot on disk: its folder (`<day>/<document>`, relative to the autosave folder) and its manifest. */
export interface AutosaveEntry {
  readonly folder: string;
  readonly manifest: AutosaveManifest;
}

/** One document's autosaved work: its newest snapshot, and every snapshot of it to mark when it is answered. */
export interface AutosavedWork {
  readonly documentId: string;
  readonly newest: AutosaveEntry;
  readonly entries: readonly AutosaveEntry[];
}

/** Whether a session still runs (this boot, its process alive). */
export type IsRunning = (session: AutosaveSession) => boolean;

/** Work declined or let go, still listed by File ▸ Recover Autosaved Work…. */
const LISTED_STATUSES: ReadonlySet<AutosaveStatus> = new Set(['declined', 'discarded']);

function savedTime(entry: AutosaveEntry): number {
  return Date.parse(entry.manifest.savedAt);
}

/** Unsaved work of a session that is over: not this one, and not running. */
function isOrphaned(entry: AutosaveEntry, sessionId: string, isRunning: IsRunning): boolean {
  const { status, session } = entry.manifest;
  return status === 'unsaved' && session.id !== sessionId && !isRunning(session);
}

/** The entries grouped by document, each group's newest first, the newest groups first, at most MAX_LISTED_WORK. */
function groupByDocument(entries: readonly AutosaveEntry[]): readonly AutosavedWork[] {
  const groups = new Map<string, AutosaveEntry[]>();
  entries.forEach((entry) => groups.set(entry.manifest.documentId, [...(groups.get(entry.manifest.documentId) ?? []), entry]));
  // A group holds at least the entry that made it, so reduce has a first value.
  const works = [...groups].map(([documentId, group]) => ({
    documentId,
    newest: group.reduce((best, each) => (savedTime(each) > savedTime(best) ? each : best)),
    entries: group,
  }));
  return works.sort((a, b) => savedTime(b.newest) - savedTime(a.newest)).slice(0, MAX_LISTED_WORK);
}

/** What the launch question offers: unsaved work left by sessions that are over, one row per document. */
export function recoverableWork(entries: readonly AutosaveEntry[], sessionId: string, isRunning: IsRunning): readonly AutosavedWork[] {
  return groupByDocument(entries.filter((entry) => isOrphaned(entry, sessionId, isRunning)));
}

/** What File ▸ Recover Autosaved Work… lists: the launch question's work, and work declined or let go. */
export function keptWork(entries: readonly AutosaveEntry[], sessionId: string, isRunning: IsRunning): readonly AutosavedWork[] {
  return groupByDocument(entries.filter((entry) => isOrphaned(entry, sessionId, isRunning) || LISTED_STATUSES.has(entry.manifest.status)));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One `{ folder, manifest }` of the native list: a `<day>/<document>` folder whose manifest names that document. */
function parseEntry(raw: unknown): AutosaveEntry | undefined {
  if (!isRecord(raw) || typeof raw.folder !== 'string' || typeof raw.manifest !== 'string') {
    return undefined;
  }
  const [day = '', documentId = '', ...rest] = raw.folder.split('/');
  const manifest = parseManifest(raw.manifest);
  const isFolder = rest.length === 0 && isDayName(day) && isFolderId(documentId);
  return isFolder && manifest?.documentId === documentId ? { folder: raw.folder, manifest } : undefined;
}

/** The native list of snapshots (GPAutosave.listSnapshots), read as untrusted: the well-formed entries. */
export function parseEntries(raw: unknown): readonly AutosaveEntry[] {
  return Array.isArray(raw) ? raw.flatMap((each: unknown) => parseEntry(each) ?? []) : [];
}
