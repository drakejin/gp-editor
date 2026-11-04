// Autosave's writes (use-autosave.ts runs them one at a time, in order): a tab's snapshot — the song as a .gp file, as
// Save As .gp writes it, with its audio track's recording — and the manifests rewritten with a new status.
import { songBytesFor } from '../lib/audio-track-files';
import { bytesToBase64 } from '../lib/base64';
import { writeManifest, writeSnapshot } from '../native/autosave';
import type { WorkspaceState } from '../state/workspace';
import { type AutosaveManifest, type AutosaveSession, manifestText } from './autosave-manifest';
import type { AutosaveEntry } from './autosave-recovery';
import { type AutosaveMark, type AutosaveTracker, afterMark, afterWrite, snapshotOf, tabsToWrite, trackTabs } from './autosave-tracker';

/** What the writes read and change: the session, the latest tabs, the tracker. */
export interface AutosaveContext {
  readonly session: () => AutosaveSession;
  readonly workspace: () => WorkspaceState;
  readonly tracker: () => AutosaveTracker;
  readonly setTracker: (next: AutosaveTracker) => void;
}

/** The tracker following the latest tabs (kept), and the tabs whose snapshot is due. */
export function dueTabs(context: AutosaveContext): readonly string[] {
  const tracker = trackTabs(context.tracker(), context.workspace(), context.session().id);
  context.setTracker(tracker);
  return tabsToWrite(tracker, context.workspace());
}

/** A manifest rewritten with `changes` (a status, this session); a snapshot gone meanwhile is let be. */
export async function rewriteManifest(entry: AutosaveEntry, changes: Partial<Pick<AutosaveManifest, 'status' | 'session'>>): Promise<void> {
  try {
    await writeManifest(entry.folder, manifestText({ ...entry.manifest, ...changes }));
  } catch {
    // The folder was removed meanwhile (an old day, another app's launch): there is nothing left to mark.
  }
}

/** Writes the tab's snapshot when it is still due; the tracker then knows it, and older days' ones are `replaced`. */
export async function writeTabSnapshot(context: AutosaveContext, tabId: string): Promise<void> {
  if (!dueTabs(context).includes(tabId)) {
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
  const entry = snapshotOf(tab, tracked, context.session(), new Date(), Date.now() - started);
  await writeSnapshot(entry.folder, base64, manifestText(entry.manifest));
  const { tracker, replaced } = afterWrite(context.tracker(), tabId, entry, song);
  context.setTracker(tracker);
  for (const old of replaced) {
    await rewriteManifest(old, { status: 'replaced' });
  }
}

/** Each mark's manifest rewritten with its status; the snapshot is then no longer pending. */
export async function writeMarks(context: AutosaveContext, marks: readonly AutosaveMark[]): Promise<void> {
  for (const mark of marks) {
    await rewriteManifest(mark.entry, { status: mark.status });
    context.setTracker(afterMark(context.tracker(), mark));
  }
}
