// Which tabs' snapshots to write, and which snapshots no longer hold the only copy of the work: each tab of the session
// is a document with an id; its snapshots on disk whose manifests still say `unsaved` are its `pending` ones. A tab
// saved (or undone back to its file) marks them `saved`, a tab closed with Don't Save `discarded`; a newer snapshot of
// it in another day's folder marks the older one `replaced`. Pure: the hook (use-autosave.ts) does the writing.
import type { Song } from '@gp-editor/core';
import { isEdited } from '../state/editor';
import { type DocumentTab, type WorkspaceState, tabTitle } from '../state/workspace';
import { dayName, documentIdOf, formatOf, snapshotFolder } from './autosave-days';
import type { AutosaveSession, AutosaveStatus } from './autosave-manifest';
import type { AutosaveEntry } from './autosave-recovery';

/** A tab of the session, as autosave knows it. */
export interface TrackedTab {
  readonly documentId: string;
  /** The song its last snapshot holds. */
  readonly writtenSong?: Song;
  /** Its snapshots whose manifests say `unsaved`: the work is only there. */
  readonly pending: readonly AutosaveEntry[];
}

/** Restored work waiting for the tab that shows its song: that tab's marks then answer for its snapshot. */
export interface Adoption {
  readonly song: Song;
  readonly entry: AutosaveEntry;
}

export interface AutosaveTracker {
  /** By tab id. */
  readonly tabs: Readonly<Record<string, TrackedTab>>;
  readonly adoptions: readonly Adoption[];
}

/** A snapshot's manifest to rewrite with a new status. */
export interface AutosaveMark {
  readonly tabId: string;
  readonly entry: AutosaveEntry;
  readonly status: AutosaveStatus;
}

export const EMPTY_TRACKER: AutosaveTracker = { tabs: {}, adoptions: [] };

function songOf(tab: DocumentTab): Song | undefined {
  return tab.editor.document?.song;
}

/** The tab's own, or a new document; a restored song's snapshot joins the tab showing that song. */
function trackOne(tracked: TrackedTab | undefined, tab: DocumentTab, sessionId: string, adoptions: readonly Adoption[]): TrackedTab {
  const own = tracked ?? { documentId: documentIdOf(sessionId, tab.id), pending: [] };
  const adopted = adoptions.filter((adoption) => adoption.song === songOf(tab));
  if (adopted.length === 0) {
    return own;
  }
  return { ...own, writtenSong: songOf(tab), pending: [...own.pending, ...adopted.map((adoption) => adoption.entry)] };
}

/**
 * The tracker following the workspace: every tab with a document tracked, restored songs given to their tabs, a closed
 * tab forgotten once nothing of it is pending. The same tracker when nothing changed.
 */
export function trackTabs(tracker: AutosaveTracker, workspace: WorkspaceState, sessionId: string): AutosaveTracker {
  const open = workspace.tabs.filter((tab) => tab.editor.document !== undefined);
  const openIds = new Set(open.map((tab) => tab.id));
  const tabs = Object.fromEntries([
    ...Object.entries(tracker.tabs).filter(([tabId, tracked]) => !openIds.has(tabId) && tracked.pending.length > 0),
    ...open.map((tab) => [tab.id, trackOne(tracker.tabs[tab.id], tab, sessionId, tracker.adoptions)] as const),
  ]);
  const adoptions = tracker.adoptions.filter((adoption) => !open.some((tab) => songOf(tab) === adoption.song));
  const isSame =
    adoptions.length === tracker.adoptions.length &&
    Object.keys(tabs).length === Object.keys(tracker.tabs).length &&
    Object.entries(tabs).every(([tabId, tracked]) => tracker.tabs[tabId] === tracked);
  return isSame ? tracker : { tabs, adoptions };
}

/** Restored work: its snapshot waits for the tab that will show `song`. */
export function adopt(tracker: AutosaveTracker, song: Song, entry: AutosaveEntry): AutosaveTracker {
  return { ...tracker, adoptions: [...tracker.adoptions, { song, entry }] };
}

/** The edited tabs whose song changed since their last snapshot (or whose snapshot was marked since), in tab order. */
export function tabsToWrite(tracker: AutosaveTracker, workspace: WorkspaceState): readonly string[] {
  return workspace.tabs
    .filter((tab) => {
      const tracked = tracker.tabs[tab.id];
      const song = songOf(tab);
      return tracked !== undefined && song !== undefined && isEdited(tab.editor) && (tracked.pending.length === 0 || song !== tracked.writtenSong);
    })
    .map((tab) => tab.id);
}

/** A tab's snapshot as of `now`: in the day's folder of its document, `unsaved`. */
export function snapshotOf(tab: DocumentTab, tracked: TrackedTab, session: AutosaveSession, now: Date, writeMs?: number): AutosaveEntry {
  const document = tab.editor.document;
  const { fileName = '', path = '' } = document ?? {};
  const manifest = {
    version: 1,
    documentId: tracked.documentId,
    title: document === undefined ? '' : tabTitle(document),
    fileName,
    path,
    format: formatOf(path),
    savedAt: now.toISOString(),
    session,
    status: 'unsaved',
    ...(writeMs === undefined ? {} : { writeMs }),
  } as const;
  return { folder: snapshotFolder(dayName(now), tracked.documentId), manifest };
}

/** A snapshot written for a tab: its only pending one now; the tab's snapshots in other folders are `replaced`. */
export function afterWrite(tracker: AutosaveTracker, tabId: string, entry: AutosaveEntry, song: Song): { readonly tracker: AutosaveTracker; readonly replaced: readonly AutosaveEntry[] } {
  const tracked = tracker.tabs[tabId] ?? { documentId: entry.manifest.documentId, pending: [] };
  const replaced = tracked.pending.filter((each) => each.folder !== entry.folder);
  const next = { ...tracked, writtenSong: song, pending: [entry] };
  return { tracker: { ...tracker, tabs: { ...tracker.tabs, [tabId]: next } }, replaced };
}

function marksOf(tabId: string, tracked: TrackedTab, status: AutosaveStatus): readonly AutosaveMark[] {
  return tracked.pending.map((entry) => ({ tabId, entry, status }));
}

/** Snapshots no longer needed: a closed tab's (Don't Save) `discarded`, a tab back to its file's (saved, undone) `saved`. */
export function marksDue(tracker: AutosaveTracker, workspace: WorkspaceState): readonly AutosaveMark[] {
  return Object.entries(tracker.tabs).flatMap(([tabId, tracked]) => {
    const tab = workspace.tabs.find((each) => each.id === tabId);
    if (tab === undefined) {
      return marksOf(tabId, tracked, 'discarded');
    }
    return isEdited(tab.editor) ? [] : marksOf(tabId, tracked, 'saved');
  });
}

/** The session ending (every edited tab answered): each pending snapshot `saved` where its tab is, else `discarded`. */
export function endMarks(tracker: AutosaveTracker, workspace: WorkspaceState): readonly AutosaveMark[] {
  return Object.entries(tracker.tabs).flatMap(([tabId, tracked]) => {
    const tab = workspace.tabs.find((each) => each.id === tabId);
    return marksOf(tabId, tracked, tab === undefined || isEdited(tab.editor) ? 'discarded' : 'saved');
  });
}

/** A mark written: the snapshot is no longer pending. */
export function afterMark(tracker: AutosaveTracker, mark: AutosaveMark): AutosaveTracker {
  const tracked = tracker.tabs[mark.tabId];
  if (tracked === undefined) {
    return tracker;
  }
  const next = { ...tracked, pending: tracked.pending.filter((entry) => entry.folder !== mark.entry.folder) };
  return { ...tracker, tabs: { ...tracker.tabs, [mark.tabId]: next } };
}
