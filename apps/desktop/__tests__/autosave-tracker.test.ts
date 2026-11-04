import type { Song } from '@gp-editor/core';
import type { AutosaveEntry } from '../src/autosave/autosave-recovery';
import {
  EMPTY_TRACKER,
  type AutosaveTracker,
  adopt,
  afterMark,
  afterWrite,
  endMarks,
  marksDue,
  snapshotOf,
  tabsToWrite,
  trackTabs,
} from '../src/autosave/autosave-tracker';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const SESSION = { id: '20261104-101500-k3f9', pid: 4242 };
const NOW = new Date(2026, 10, 4, 10, 30, 0);
const SONG = makeSong([[beat(960, [note(1, 3)])]]);

function run(actions: readonly WorkspaceAction[], start: WorkspaceState = INITIAL_WORKSPACE): WorkspaceState {
  return actions.reduce(workspaceReducer, start);
}

/** Canon.gp5 (tab-1) and Riff.gp (tab-2, shown), neither edited. */
function twoTabs(): WorkspaceState {
  return run([
    { type: 'loaded', document: { fileName: 'Canon.gp5', path: '/scores/Canon.gp5', song: SONG } },
    { type: 'loaded', document: { fileName: 'Riff.gp', path: '/scores/Riff.gp', song: { ...SONG, info: { ...SONG.info, title: 'Riff' } } } },
  ]);
}

function songOf(workspace: WorkspaceState, tabId: string): Song {
  const song = workspace.tabs.find((tab) => tab.id === tabId)?.editor.document?.song;
  if (song === undefined) {
    throw new Error(`no song in ${tabId}`);
  }
  return song;
}

/** The tracker after `tabId`'s snapshot was written from the workspace as it is. */
function written(tracker: AutosaveTracker, workspace: WorkspaceState, tabId: string, now: Date = NOW): AutosaveTracker {
  const tab = workspace.tabs.find((each) => each.id === tabId);
  const tracked = tracker.tabs[tabId];
  if (tab === undefined || tracked === undefined) {
    throw new Error(`${tabId} is not tracked`);
  }
  return afterWrite(tracker, tabId, snapshotOf(tab, tracked, SESSION, now), songOf(workspace, tabId)).tracker;
}

describe('autosave tracker: what to write', () => {
  it('gives each tab a document id of this session', () => {
    const tracker = trackTabs(EMPTY_TRACKER, twoTabs(), SESSION.id);
    expect(tracker.tabs['tab-1']?.documentId).toBe(`${SESSION.id}-tab-1`);
    expect(tracker.tabs['tab-2']?.documentId).toBe(`${SESSION.id}-tab-2`);
  });

  it('writes only the edited tabs, and a written one again only once it changed', () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = trackTabs(EMPTY_TRACKER, edited, SESSION.id);

    // Act
    const before = tabsToWrite(tracker, edited);
    const after = written(tracker, edited, 'tab-2');
    const changedAgain = workspaceReducer(edited, { type: 'setNoteFret', fret: 9 });

    // Assert
    expect(before).toEqual(['tab-2']);
    expect(tabsToWrite(after, edited)).toEqual([]);
    expect(tabsToWrite(after, changedAgain)).toEqual(['tab-2']);
  });

  it('writes a new song once it is edited, with no path and no format', () => {
    // Arrange
    const created = run([{ type: 'created', mode: 'tab' }, { type: 'setNoteFret', fret: 2 }]);
    const tracker = trackTabs(EMPTY_TRACKER, created, SESSION.id);
    const tab = created.tabs[0];

    // Act
    const snapshot = tab === undefined ? undefined : snapshotOf(tab, tracker.tabs['tab-1']!, SESSION, NOW, 12);

    // Assert
    expect(tabsToWrite(tracker, created)).toEqual(['tab-1']);
    expect(snapshot?.folder).toBe(`2026-11-04/${SESSION.id}-tab-1`);
    expect(snapshot?.manifest).toMatchObject({ path: '', format: '', status: 'unsaved', session: SESSION, writeMs: 12, savedAt: NOW.toISOString() });
  });

  it('describes the file a snapshot is of: title, file name, path and format', () => {
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = trackTabs(EMPTY_TRACKER, edited, SESSION.id);
    const snapshot = snapshotOf(edited.tabs[1]!, tracker.tabs['tab-2']!, SESSION, NOW);
    expect(snapshot.manifest).toMatchObject({ title: 'Riff', fileName: 'Riff.gp', path: '/scores/Riff.gp', format: 'gp', documentId: `${SESSION.id}-tab-2` });
  });

  it('marks an older day’s snapshot of the document replaced when a new day’s is written', () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const yesterday = written(trackTabs(EMPTY_TRACKER, edited, SESSION.id), edited, 'tab-2', new Date(2026, 10, 3, 23, 59));
    const later = workspaceReducer(edited, { type: 'setNoteFret', fret: 8 });

    // Act
    const today = snapshotOf(later.tabs[1]!, yesterday.tabs['tab-2']!, SESSION, NOW);
    const result = afterWrite(yesterday, 'tab-2', today, songOf(later, 'tab-2'));

    // Assert
    expect(result.replaced.map((entry) => entry.folder)).toEqual([`2026-11-03/${SESSION.id}-tab-2`]);
    expect(result.tracker.tabs['tab-2']?.pending.map((entry) => entry.folder)).toEqual([today.folder]);
  });
});

describe('autosave tracker: what no longer needs its snapshot', () => {
  it('marks a tab’s snapshot saved once the tab is saved', () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = written(trackTabs(EMPTY_TRACKER, edited, SESSION.id), edited, 'tab-2');
    const saved = workspaceReducer(edited, { type: 'saved', fileName: 'Riff.gp', path: '/scores/Riff.gp', song: songOf(edited, 'tab-2') });

    // Act
    const marks = marksDue(tracker, saved);

    // Assert
    expect(marksDue(tracker, edited)).toEqual([]);
    expect(marks.map((mark) => [mark.tabId, mark.status])).toEqual([['tab-2', 'saved']]);
    expect(marksDue(afterMark(tracker, marks[0]!), saved)).toEqual([]);
  });

  it('marks it saved too when undo takes the tab back to its file, and writes it again on redo', () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = written(trackTabs(EMPTY_TRACKER, edited, SESSION.id), edited, 'tab-2');
    const undone = workspaceReducer(edited, { type: 'undo' });
    const marks = marksDue(tracker, undone);

    // Act
    const redone = workspaceReducer(undone, { type: 'redo' });

    // Assert
    expect(marks.map((mark) => mark.status)).toEqual(['saved']);
    expect(tabsToWrite(afterMark(tracker, marks[0]!), redone)).toEqual(['tab-2']);
  });

  it('marks a closed tab’s snapshot discarded (Don’t Save), and forgets the tab', () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = written(trackTabs(EMPTY_TRACKER, edited, SESSION.id), edited, 'tab-2');
    const closed = workspaceReducer(edited, { type: 'closeTab', tabId: 'tab-2' });

    // Act
    const marks = marksDue(tracker, closed);
    const after = trackTabs(afterMark(tracker, marks[0]!), closed, SESSION.id);

    // Assert
    expect(marks.map((mark) => [mark.tabId, mark.status])).toEqual([['tab-2', 'discarded']]);
    expect(after.tabs['tab-2']).toBeUndefined();
  });

  it('keeps a closed tab while its snapshot is still to be marked', () => {
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const tracker = written(trackTabs(EMPTY_TRACKER, edited, SESSION.id), edited, 'tab-2');
    const closed = workspaceReducer(edited, { type: 'closeTab', tabId: 'tab-2' });
    expect(trackTabs(tracker, closed, SESSION.id).tabs['tab-2']?.pending).toHaveLength(1);
  });

  it('at the end of the session marks every snapshot: saved where the tab is, discarded where it was let go', () => {
    // Arrange
    const both = run([{ type: 'setNoteFret', fret: 7 }, { type: 'switchTab', tabId: 'tab-1' }, { type: 'setNoteFret', fret: 5 }], twoTabs());
    const tracker = written(written(trackTabs(EMPTY_TRACKER, both, SESSION.id), both, 'tab-1'), both, 'tab-2');
    const firstSaved = workspaceReducer(both, { type: 'saved', fileName: 'Canon.gp5', path: '/scores/Canon.gp5', song: songOf(both, 'tab-1') });

    // Act
    const marks = endMarks(tracker, firstSaved);

    // Assert
    expect(marks.map((mark) => [mark.tabId, mark.status])).toEqual([
      ['tab-1', 'saved'],
      ['tab-2', 'discarded'],
    ]);
  });
});

describe('autosave tracker: restored work', () => {
  it('gives a restored snapshot to the tab that shows its song, so the tab’s marks answer for it', () => {
    // Arrange
    const restoredSong = { ...SONG, info: { ...SONG.info, title: 'Restored' } };
    const entry: AutosaveEntry = {
      folder: '2026-11-03/old-tab-4',
      manifest: { version: 1, documentId: 'old-tab-4', title: 'Restored', fileName: 'R.gp5', path: '/scores/R.gp5', format: 'gp5', savedAt: '2026-11-03T10:00:00.000Z', session: SESSION, status: 'unsaved' },
    };
    const restored = workspaceReducer(twoTabs(), { type: 'restoreTab', document: { fileName: 'R.gp5', path: '/scores/R.gp5', song: restoredSong } });

    // Act
    const tracker = trackTabs(adopt(EMPTY_TRACKER, restoredSong, entry), restored, SESSION.id);

    // Assert
    expect(tracker.tabs['tab-3']?.pending).toEqual([entry]);
    expect(tracker.adoptions).toEqual([]);
    expect(tabsToWrite(tracker, restored)).toEqual([]);
  });
});
