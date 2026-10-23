import type { Song } from '@gp-editor/core';
import { INITIAL_EDITOR_STATE, type OpenDocument, isEdited } from '../src/state/editor';
import {
  INITIAL_WORKSPACE,
  type WorkspaceAction,
  type WorkspaceState,
  activeEditor,
  activeTab,
  tabLabels,
  tabTitle,
  workspaceReducer,
} from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const SONG = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(6, 0)])]]);

function document(fileName: string, path = `/scores/${fileName}`, song: Song = SONG): OpenDocument {
  return { fileName, path, song };
}

function run(actions: readonly WorkspaceAction[], start: WorkspaceState = INITIAL_WORKSPACE): WorkspaceState {
  return actions.reduce(workspaceReducer, start);
}

/** Three files open, the last one shown. */
function threeTabs(): WorkspaceState {
  return run(['A.gp5', 'B.gp5', 'C.gp5'].map((fileName) => ({ type: 'loaded', document: document(fileName) })));
}

const fileNames = (state: WorkspaceState) => state.tabs.map((tab) => tab.editor.document?.fileName);
const shownFile = (state: WorkspaceState) => activeEditor(state).document?.fileName;
const fret = (state: WorkspaceState, tabIndex: number) =>
  state.tabs[tabIndex]?.editor.document?.song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.fret;

describe('workspaceReducer: opening documents in tabs', () => {
  it('starts with no tab, nothing loading and the start screen’s editor', () => {
    expect(INITIAL_WORKSPACE.tabs).toEqual([]);
    expect(INITIAL_WORKSPACE.isLoading).toBe(false);
    expect(activeTab(INITIAL_WORKSPACE)).toBeUndefined();
    expect(activeEditor(INITIAL_WORKSPACE)).toBe(INITIAL_EDITOR_STATE);
  });

  it('opens a loaded file in a new tab, shown, with a fresh editor on the first beat', () => {
    // Arrange
    const loading = workspaceReducer(INITIAL_WORKSPACE, { type: 'loadStarted' });

    // Act
    const state = workspaceReducer(loading, { type: 'loaded', document: document('A.gp5') });

    // Assert
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
    expect(state.isLoading).toBe(false);
    expect(activeEditor(state)).toMatchObject({ past: [], future: [], trackIndex: 0 });
    expect(activeEditor(state).cursor).toEqual({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 });
    expect(isEdited(activeEditor(state))).toBe(false);
  });

  it('opens each further file in its own tab after the others and shows it', () => {
    const state = threeTabs();
    expect(fileNames(state)).toEqual(['A.gp5', 'B.gp5', 'C.gp5']);
    expect(shownFile(state)).toBe('C.gp5');
    expect(new Set(state.tabs.map((tab) => tab.id)).size).toBe(3);
  });

  it('shows the tab already holding a file instead of opening it twice, keeping its edits', () => {
    // Arrange: A is edited (fret 3 → 7), then B is shown
    const edited = run([
      { type: 'loaded', document: document('A.gp5') },
      { type: 'setNoteFret', fret: 7 },
      { type: 'loaded', document: document('B.gp5') },
      { type: 'loadStarted' },
    ]);

    // Act
    const state = workspaceReducer(edited, { type: 'loaded', document: document('A.gp5') });

    // Assert
    expect(fileNames(state)).toEqual(['A.gp5', 'B.gp5']);
    expect(shownFile(state)).toBe('A.gp5');
    expect(fret(state, 0)).toBe(7);
    expect(state.isLoading).toBe(false);
  });

  it('opens every new sheet in a tab of its own, in the chosen view', () => {
    // Act
    const state = run([
      { type: 'loaded', document: document('A.gp5') },
      { type: 'created', mode: 'tab' },
      { type: 'created', mode: 'notation' },
    ]);

    // Assert
    expect(fileNames(state)).toEqual(['A.gp5', 'Untitled', 'Untitled']);
    expect(state.tabs.map((tab) => tab.editor.mode)).toEqual(['notationAndTab', 'tab', 'notation']);
    expect(activeEditor(state).mode).toBe('notation');
    expect(isEdited(activeEditor(state))).toBe(false);
  });

  it('opens a file in the view of the tab shown before it', () => {
    const state = run([
      { type: 'loaded', document: document('A.gp5') },
      { type: 'setMode', mode: 'tab' },
      { type: 'loaded', document: document('B.gp5') },
    ]);
    expect(activeEditor(state).mode).toBe('tab');
  });

  it('opens a document no file holds yet (a generated song) as edited until it is saved', () => {
    // Arrange
    const generated = document('Song Writer.gp5', '');

    // Act
    const opened = workspaceReducer(INITIAL_WORKSPACE, { type: 'openTab', document: generated, isUnsaved: true });
    const saved = workspaceReducer(opened, { type: 'saved', fileName: 'Mine.gp5', path: '/scores/Mine.gp5', song: SONG });

    // Assert
    expect(isEdited(activeEditor(opened))).toBe(true);
    expect(isEdited(activeEditor(saved))).toBe(false);
    expect(activeEditor(saved).document?.path).toBe('/scores/Mine.gp5');
  });

  it('opens a document with openTab like a loaded file when it is not marked unsaved', () => {
    const state = workspaceReducer(threeTabs(), { type: 'openTab', document: document('D.gp5') });
    expect(fileNames(state)).toEqual(['A.gp5', 'B.gp5', 'C.gp5', 'D.gp5']);
    expect(isEdited(activeEditor(state))).toBe(false);
  });

  it('tracks loading, cancel and failure for the window, leaving the shown tab alone', () => {
    // Arrange
    const start = threeTabs();

    // Act
    const loading = workspaceReducer(start, { type: 'loadStarted' });
    const cancelled = workspaceReducer(loading, { type: 'loadCancelled' });
    const failed = workspaceReducer(loading, { type: 'loadFailed', message: 'bad header' });

    // Assert
    expect(loading.isLoading).toBe(true);
    expect(cancelled.isLoading).toBe(false);
    expect(failed).toMatchObject({ isLoading: false, error: 'Could not open the file: bad header' });
    expect(failed.tabs).toBe(start.tabs);
  });

  it('dismisses the window’s error and the shown tab’s error together', () => {
    // Arrange
    const failed = run([{ type: 'saveFailed', message: 'disk full' }, { type: 'loadFailed', message: 'bad header' }], threeTabs());

    // Act
    const state = workspaceReducer(failed, { type: 'dismissError' });

    // Assert
    expect(activeEditor(failed).error).toBe('Could not save: disk full');
    expect(state.error).toBeUndefined();
    expect(activeEditor(state).error).toBeUndefined();
  });
});

describe('workspaceReducer: editor actions go to the shown tab', () => {
  it('edits and undoes in the shown tab only, each tab keeping its own history', () => {
    // Arrange: A and B open, B shown
    const start = run([
      { type: 'loaded', document: document('A.gp5') },
      { type: 'loaded', document: document('B.gp5') },
    ]);

    // Act
    const edited = run([{ type: 'setNoteFret', fret: 9 }], start);
    const backOnA = run([{ type: 'switchTab', tabId: start.tabs[0]!.id }, { type: 'undo' }], edited);

    // Assert
    expect([fret(edited, 0), fret(edited, 1)]).toEqual([3, 9]);
    expect(backOnA.tabs[0]?.editor).toBe(edited.tabs[0]?.editor);
    expect(backOnA.tabs[1]?.editor.past).toHaveLength(1);
  });

  it('keeps each tab’s cursor, track and view when switching between tabs', () => {
    // Arrange
    const start = threeTabs();
    const moved = run([{ type: 'moveCursorBeat', step: 1 }, { type: 'setMode', mode: 'tab' }], start);

    // Act
    const away = workspaceReducer(moved, { type: 'switchTab', tabId: moved.tabs[0]!.id });
    const back = workspaceReducer(away, { type: 'switchTab', tabId: moved.tabs[2]!.id });

    // Assert
    expect(activeEditor(away).mode).toBe('notationAndTab');
    expect(activeEditor(back)).toBe(activeEditor(moved));
    expect(activeEditor(back).cursor?.measureIndex).toBe(1);
  });

  it('returns the same state when no tab is open or the editor does not change', () => {
    expect(workspaceReducer(INITIAL_WORKSPACE, { type: 'setNoteFret', fret: 5 })).toBe(INITIAL_WORKSPACE);
    const start = threeTabs();
    expect(workspaceReducer(start, { type: 'dismissHint' })).toBe(start);
  });

  it('sends an editor action to a named tab while another is shown (a save that ends later)', () => {
    // Arrange
    const start = run([{ type: 'setNoteFret', fret: 7 }], threeTabs());
    const savedTab = start.tabs[2]!;
    const shown = workspaceReducer(start, { type: 'switchTab', tabId: start.tabs[0]!.id });

    // Act
    const state = workspaceReducer(shown, {
      type: 'inTab',
      tabId: savedTab.id,
      action: { type: 'saved', fileName: 'C.gp5', path: '/scores/C.gp5', song: savedTab.editor.document!.song },
    });

    // Assert
    expect(isEdited(state.tabs[2]!.editor)).toBe(false);
    expect(state.tabs[0]?.editor).toBe(shown.tabs[0]?.editor);
    expect(shownFile(state)).toBe('A.gp5');
  });

  it('ignores an action sent to a tab that is closed', () => {
    const start = threeTabs();
    expect(workspaceReducer(start, { type: 'inTab', tabId: 'gone', action: { type: 'undo' } })).toBe(start);
  });
});

describe('workspaceReducer: switching and closing tabs', () => {
  it('shows the tab picked; an unknown tab changes nothing', () => {
    const start = threeTabs();
    expect(shownFile(workspaceReducer(start, { type: 'switchTab', tabId: start.tabs[1]!.id }))).toBe('B.gp5');
    expect(workspaceReducer(start, { type: 'switchTab', tabId: 'gone' })).toBe(start);
    expect(workspaceReducer(start, { type: 'switchTab', tabId: start.activeTabId! })).toBe(start);
  });

  it('goes to the next and previous tab, round from the last to the first', () => {
    // Arrange: C (the last) is shown
    const start = threeTabs();

    // Act
    const next = workspaceReducer(start, { type: 'cycleTab', step: 1 });
    const previous = workspaceReducer(next, { type: 'cycleTab', step: -1 });
    const twoBack = run([{ type: 'cycleTab', step: -1 }, { type: 'cycleTab', step: -1 }], start);

    // Assert
    expect(shownFile(next)).toBe('A.gp5');
    expect(shownFile(previous)).toBe('C.gp5');
    expect(shownFile(twoBack)).toBe('A.gp5');
  });

  it('stays on the only tab, and on none, when cycling', () => {
    const single = workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: document('A.gp5') });
    expect(workspaceReducer(single, { type: 'cycleTab', step: 1 })).toBe(single);
    expect(workspaceReducer(INITIAL_WORKSPACE, { type: 'cycleTab', step: -1 })).toBe(INITIAL_WORKSPACE);
  });

  it('shows the tab to the right after closing the shown tab', () => {
    // Arrange: B shown
    const start = threeTabs();
    const onB = workspaceReducer(start, { type: 'switchTab', tabId: start.tabs[1]!.id });

    // Act
    const state = workspaceReducer(onB, { type: 'closeTab', tabId: start.tabs[1]!.id });

    // Assert
    expect(fileNames(state)).toEqual(['A.gp5', 'C.gp5']);
    expect(shownFile(state)).toBe('C.gp5');
  });

  it('shows the tab to the left after closing the shown last tab', () => {
    const start = threeTabs();
    const state = workspaceReducer(start, { type: 'closeTab', tabId: start.tabs[2]!.id });
    expect(fileNames(state)).toEqual(['A.gp5', 'B.gp5']);
    expect(shownFile(state)).toBe('B.gp5');
  });

  it('keeps the shown tab when another tab is closed', () => {
    const start = threeTabs();
    const state = workspaceReducer(start, { type: 'closeTab', tabId: start.tabs[0]!.id });
    expect(fileNames(state)).toEqual(['B.gp5', 'C.gp5']);
    expect(state.activeTabId).toBe(start.activeTabId);
  });

  it('closes the last tab back to the start screen; an unknown tab changes nothing', () => {
    // Arrange
    const single = workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: document('A.gp5') });

    // Act
    const closed = workspaceReducer(single, { type: 'closeTab', tabId: single.activeTabId! });

    // Assert
    expect(closed.tabs).toEqual([]);
    expect(closed.activeTabId).toBeUndefined();
    expect(activeEditor(closed)).toBe(INITIAL_EDITOR_STATE);
    expect(workspaceReducer(single, { type: 'closeTab', tabId: 'gone' })).toBe(single);
  });

  it('never gives a new tab the id of a closed one', () => {
    // Arrange
    const start = threeTabs();
    const closed = workspaceReducer(start, { type: 'closeTab', tabId: start.tabs[2]!.id });

    // Act
    const reopened = workspaceReducer(closed, { type: 'created', mode: 'tab' });

    // Assert
    expect(start.tabs.map((tab) => tab.id)).not.toContain(reopened.activeTabId);
  });
});

describe('tab titles', () => {
  it('names a tab after the song’s title, else its file name', () => {
    expect(tabTitle(document('A.gp5'))).toBe('Test');
    expect(tabTitle(document('A.gp5', '/a', { ...SONG, info: { ...SONG.info, title: '  ' } }))).toBe('A.gp5');
  });

  it('lists every tab with its title, file name and whether it is edited', () => {
    // Arrange
    const start = run([{ type: 'created', mode: 'tab' }, { type: 'setNoteFret', fret: 2 }], threeTabs());

    // Act
    const labels = tabLabels(start);

    // Assert
    expect(labels.map((label) => [label.title, label.fileName, label.isEdited])).toEqual([
      ['Test', 'A.gp5', false],
      ['Test', 'B.gp5', false],
      ['Test', 'C.gp5', false],
      ['Untitled', 'Untitled', true],
    ]);
    expect(labels.map((label) => label.id)).toEqual(start.tabs.map((tab) => tab.id));
  });
});
