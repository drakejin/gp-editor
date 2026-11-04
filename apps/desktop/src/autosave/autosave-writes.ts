// Autosave's writes (use-autosave.ts runs them one at a time, in order): a tab's snapshot — the song as a .gp file, as
// Save As .gp writes it, with its audio track's recording — and the manifests rewritten with a new status. A mark that
// cannot be written stays pending, so the next one tries again; only a snapshot gone meanwhile is let be.
import { songBytesFor } from '../lib/audio-track-files';
import { bytesToBase64 } from '../lib/base64';
import { writeManifest, writeSnapshot } from '../native/autosave';
import type { WorkspaceState } from '../state/workspace';
import { type AutosaveManifest, type AutosaveSession, manifestText } from './autosave-manifest';
import type { AutosaveEntry } from './autosave-recovery';
import { type AutosaveMark, type AutosaveTracker, afterMark, afterWrite, keepPending, marksDue, snapshotOf, tabsToWrite, trackTabs } from './autosave-tracker';

/** What the writes read and change: the session (undefined until its process is known), the latest tabs, the tracker. */
export interface AutosaveContext {
  readonly sessionId: string;
  readonly session: () => AutosaveSession | undefined;
  readonly workspace: () => WorkspaceState;
  readonly tracker: () => AutosaveTracker;
  readonly setTracker: (next: AutosaveTracker) => void;
}

/** The native codes of a snapshot that is no longer there (an old day removed, another app's launch): nothing to mark. */
const GONE_CODES: ReadonlySet<unknown> = new Set(['missing', 'bad_folder']);

function isGone(error: unknown): boolean {
  return typeof error === 'object' && error !== null && GONE_CODES.has((error as { readonly code?: unknown }).code);
}

/** The tracker following the latest tabs (kept), and the tabs whose snapshot is due — none while the session is not known. */
export function dueTabs(context: AutosaveContext): readonly string[] {
  const tracker = trackTabs(context.tracker(), context.workspace(), context.sessionId);
  context.setTracker(tracker);
  return context.session() === undefined ? [] : tabsToWrite(tracker, context.workspace());
}

/** A manifest rewritten with `changes` (a status, this session); a snapshot gone meanwhile is let be, other failures thrown. */
export async function rewriteManifest(entry: AutosaveEntry, changes: Partial<Pick<AutosaveManifest, 'status' | 'session'>>): Promise<void> {
  try {
    await writeManifest(entry.folder, manifestText({ ...entry.manifest, ...changes }));
  } catch (error: unknown) {
    if (!isGone(error)) {
      throw error;
    }
  }
}

/** Each mark's manifest rewritten with its status; a mark written is no longer pending, one that failed stays (thrown after). */
export async function writeMarks(context: AutosaveContext, marks: readonly AutosaveMark[]): Promise<void> {
  let failure: unknown;
  for (const mark of marks) {
    try {
      await rewriteManifest(mark.entry, { status: mark.status });
      context.setTracker(afterMark(context.tracker(), mark));
    } catch (error: unknown) {
      failure = failure ?? error;
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
}

/** Older days' snapshots of the tab marked `replaced`; those that could not be stay the tab's (thrown after). */
async function markReplaced(context: AutosaveContext, tabId: string, replaced: readonly AutosaveEntry[]): Promise<unknown> {
  const kept: AutosaveEntry[] = [];
  let failure: unknown;
  for (const old of replaced) {
    try {
      await rewriteManifest(old, { status: 'replaced' });
    } catch (error: unknown) {
      kept.push(old);
      failure = failure ?? error;
    }
  }
  context.setTracker(keepPending(context.tracker(), tabId, kept));
  return failure;
}

/**
 * Writes the tab's snapshot when it is still due; the tracker then knows it, older days' ones are `replaced`, and what
 * changed meanwhile (the tab saved or closed while it was written) is marked at once.
 */
export async function writeTabSnapshot(context: AutosaveContext, tabId: string): Promise<void> {
  const session = context.session();
  if (session === undefined || !dueTabs(context).includes(tabId)) {
    return;
  }
  const tab = context.workspace().tabs.find((each) => each.id === tabId);
  const tracked = context.tracker().tabs[tabId];
  const song = tab?.editor.document?.song;
  if (tab === undefined || tracked === undefined || song === undefined) {
    return;
  }
  const started = Date.now();
  const { bytes } = await songBytesFor(song, 'gp');
  const base64 = bytesToBase64(bytes);
  const entry = snapshotOf(tab, tracked, session, new Date(), Date.now() - started);
  await writeSnapshot(entry.folder, base64, manifestText(entry.manifest));
  const { tracker, replaced } = afterWrite(context.tracker(), tabId, entry, song);
  context.setTracker(tracker);
  const failure = await markReplaced(context, tabId, replaced);
  await writeMarks(context, marksDue(trackTabs(context.tracker(), context.workspace(), context.sessionId), context.workspace()));
  if (failure !== undefined) {
    throw failure;
  }
}
