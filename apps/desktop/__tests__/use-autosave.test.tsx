import ReactTestRenderer from 'react-test-renderer';
import { type Song, readSongFile } from '@gp-editor/core';
import { type AutosaveManifest, parseManifest } from '../src/autosave/autosave-manifest';
import { AUTOSAVE_IDLE_MS, AUTOSAVE_INTERVAL_MS, AUTOSAVE_MAX_DELAY_MS } from '../src/autosave/autosave-schedule';
import { type Autosave, useAutosave } from '../src/hooks/use-autosave';
import { base64ToBytes } from '../src/lib/base64';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

/** The autosave folder in memory: folder → the snapshot's base64 and the manifest's text. */
const mockDisk = new Map<string, { base64: string; manifest: string }>();
const BOOT_ID = 'BAA8756F-444D-4F6E-8783-5D2A67D4F287';
const mockNative = {
  currentSession: jest.fn(async () => ({ pid: 4242, bootId: BOOT_ID })),
  writeSnapshot: jest.fn(async (folder: string, base64: string, manifest: string) => {
    mockDisk.set(folder, { base64, manifest });
  }),
  writeManifest: jest.fn(async (folder: string, manifest: string) => {
    const kept = mockDisk.get(folder);
    if (kept === undefined) {
      throw new Error('missing');
    }
    mockDisk.set(folder, { ...kept, manifest });
  }),
};

jest.mock('../src/native/autosave', () => ({
  isAutosaveAvailable: () => true,
  currentSession: () => mockNative.currentSession(),
  writeSnapshot: (folder: string, base64: string, manifest: string) => mockNative.writeSnapshot(folder, base64, manifest),
  writeManifest: (folder: string, manifest: string) => mockNative.writeManifest(folder, manifest),
}));

const SONG = makeSong([[beat(960, [note(1, 3)])]]);
const TODAY = new Date(2026, 10, 4, 10, 0, 0);

function run(actions: readonly WorkspaceAction[], start: WorkspaceState = INITIAL_WORKSPACE): WorkspaceState {
  return actions.reduce(workspaceReducer, start);
}

/** Canon.gp5 (tab-1) and Riff.gp5 (tab-2, shown). */
function twoTabs(): WorkspaceState {
  return run([
    { type: 'loaded', document: { fileName: 'Canon.gp5', path: '/scores/Canon.gp5', song: SONG } },
    { type: 'loaded', document: { fileName: 'Riff.gp5', path: '/scores/Riff.gp5', song: SONG } },
  ]);
}

interface Probe {
  readonly current: () => Autosave;
  readonly update: (workspace: WorkspaceState, isPlaying?: boolean) => void;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
}

function renderAutosave(workspace: WorkspaceState, isPlaying = false): Probe {
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  let latest: Autosave | undefined;
  function Hook({ shown, playing }: { readonly shown: WorkspaceState; readonly playing: boolean }) {
    latest = useAutosave(shown, dispatch, playing);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Hook shown={workspace} playing={isPlaying} />);
  });
  return {
    current: () => latest!,
    update: (next, playing = false) => ReactTestRenderer.act(() => renderer.update(<Hook shown={next} playing={playing} />)),
    dispatch,
  };
}

/** Time goes on by `ms`, the promises it starts settled. */
async function elapse(ms: number): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function manifests(): readonly AutosaveManifest[] {
  return [...mockDisk.values()].flatMap(({ manifest }) => parseManifest(manifest) ?? []);
}

function fretIn(song: Song): number | undefined {
  return song.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.notes[0]?.fret;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
  mockDisk.clear();
  jest.clearAllMocks();
  mockNative.currentSession.mockImplementation(async () => ({ pid: 4242, bootId: BOOT_ID }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAutosave: every 30 s', () => {
  it('writes an edited tab’s song as a .gp snapshot with its manifest in today’s folder', async () => {
    // Arrange
    renderAutosave(workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 }));

    // Act
    await elapse(AUTOSAVE_INTERVAL_MS);

    // Assert
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
    const [[folder, base64]] = mockNative.writeSnapshot.mock.calls as unknown as [[string, string, string]];
    expect(folder).toMatch(/^2026-11-04\/20261104-100000-[0-9a-z]{4}-tab-2$/);
    expect(fretIn(readSongFile(base64ToBytes(base64)).song)).toBe(7);
    expect(manifests()).toEqual([
      expect.objectContaining({ title: 'Test', fileName: 'Riff.gp5', path: '/scores/Riff.gp5', format: 'gp5', status: 'unsaved', session: expect.objectContaining({ pid: 4242, bootId: BOOT_ID }) }),
    ]);
  });

  it('writes nothing while the app’s session (its process and boot) is not known', async () => {
    mockNative.currentSession.mockReturnValue(new Promise(() => undefined));
    renderAutosave(workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 }));
    await elapse(AUTOSAVE_INTERVAL_MS * 3);
    expect(mockNative.writeSnapshot).not.toHaveBeenCalled();
  });

  it('starts again after the session ended when a tab is edited anew (the window closed, the app still running)', async () => {
    // Arrange
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const probe = renderAutosave(edited);
    await ReactTestRenderer.act(() => probe.current().endSession());

    // Act
    probe.update(workspaceReducer(edited, { type: 'setNoteFret', fret: 9 }));
    await elapse(AUTOSAVE_INTERVAL_MS);

    // Assert
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('writes nothing while nothing changed, and nothing again until the song changes', async () => {
    // Arrange
    const probe = renderAutosave(twoTabs());

    // Act
    await elapse(AUTOSAVE_INTERVAL_MS * 2);
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    probe.update(edited);
    await elapse(AUTOSAVE_INTERVAL_MS * 3);

    // Assert
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('waits for a pause in the editing before it writes', async () => {
    // Arrange
    let workspace = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const probe = renderAutosave(workspace);
    await elapse(AUTOSAVE_INTERVAL_MS - 1_000);

    // Act: a key every second across the tick, then a pause
    for (let step = 0; step < 5; step++) {
      workspace = workspaceReducer(workspace, { type: 'moveCursorBeat', step: step % 2 === 0 ? 1 : -1 });
      probe.update(workspace);
      await elapse(1_000);
    }
    const whileTyping = mockNative.writeSnapshot.mock.calls.length;
    await elapse(AUTOSAVE_IDLE_MS);

    // Assert
    expect(whileTyping).toBe(0);
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('waits for a pause again in the next round, not counting the time of the round before', async () => {
    // Arrange: a first snapshot, then the song edited again
    let workspace = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const probe = renderAutosave(workspace);
    await elapse(AUTOSAVE_INTERVAL_MS);
    workspace = workspaceReducer(workspace, { type: 'setNoteFret', fret: 9 });
    probe.update(workspace);

    // Act: a key every second across the next round's tick
    for (let step = 0; step < AUTOSAVE_INTERVAL_MS / 1_000 + 5; step++) {
      workspace = workspaceReducer(workspace, { type: 'moveCursorBeat', step: step % 2 === 0 ? 1 : -1 });
      probe.update(workspace);
      await elapse(1_000);
    }
    const whileTyping = mockNative.writeSnapshot.mock.calls.length;
    await elapse(AUTOSAVE_IDLE_MS);

    // Assert
    expect(whileTyping).toBe(1);
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it('waits while playback plays, but never longer than the longest delay', async () => {
    // Arrange
    renderAutosave(workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 }), true);

    // Act
    await elapse(AUTOSAVE_INTERVAL_MS + AUTOSAVE_MAX_DELAY_MS - 2_000);
    const whilePlaying = mockNative.writeSnapshot.mock.calls.length;
    await elapse(2_000);

    // Assert
    expect(whilePlaying).toBe(0);
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('writes each edited tab, a pause apart', async () => {
    // Arrange
    const both = run([{ type: 'setNoteFret', fret: 7 }, { type: 'switchTab', tabId: 'tab-1' }, { type: 'setNoteFret', fret: 5 }], twoTabs());
    renderAutosave(both);

    // Act
    await elapse(AUTOSAVE_INTERVAL_MS);
    const first = mockNative.writeSnapshot.mock.calls.length;
    await elapse(AUTOSAVE_IDLE_MS);

    // Assert
    expect(first).toBe(1);
    expect(manifests().map((manifest) => manifest.fileName).sort()).toEqual(['Canon.gp5', 'Riff.gp5']);
  });
});

describe('useAutosave: snapshots no longer needed', () => {
  async function editedAndWritten(): Promise<{ readonly probe: Probe; readonly edited: WorkspaceState }> {
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const probe = renderAutosave(edited);
    await elapse(AUTOSAVE_INTERVAL_MS);
    return { probe, edited };
  }

  it('marks the snapshot saved once the tab is saved (⌘S)', async () => {
    // Arrange
    const { probe, edited } = await editedAndWritten();
    const song = edited.tabs[1]?.editor.document?.song ?? SONG;

    // Act
    probe.update(workspaceReducer(edited, { type: 'saved', fileName: 'Riff.gp5', path: '/scores/Riff.gp5', song }));
    await elapse(0);

    // Assert
    expect(manifests().map((manifest) => manifest.status)).toEqual(['saved']);
  });

  it('marks it saved when the save question’s Save saved the tab and closed it at once', async () => {
    // Arrange
    const { probe, edited } = await editedAndWritten();

    // Act: the saved state never rendered before the tab closed
    ReactTestRenderer.act(() => probe.current().markSaved('tab-2'));
    probe.update(workspaceReducer(edited, { type: 'closeTab', tabId: 'tab-2' }));
    await elapse(0);

    // Assert
    expect(manifests().map((manifest) => manifest.status)).toEqual(['saved']);
  });

  it('marks a snapshot saved when its tab was saved while it was being written', async () => {
    // Arrange: the write waits until the test lets it go
    let finishWrite: () => void = () => undefined;
    mockNative.writeSnapshot.mockImplementationOnce(
      (folder: string, base64: string, manifest: string) =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            mockDisk.set(folder, { base64, manifest });
            resolve();
          };
        }),
    );
    const edited = workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 });
    const probe = renderAutosave(edited);
    await elapse(AUTOSAVE_INTERVAL_MS);
    const song = edited.tabs[1]?.editor.document?.song ?? SONG;

    // Act
    probe.update(workspaceReducer(edited, { type: 'saved', fileName: 'Riff.gp5', path: '/scores/Riff.gp5', song }));
    await ReactTestRenderer.act(async () => finishWrite());
    await elapse(0);

    // Assert
    expect(manifests().map((manifest) => manifest.status)).toEqual(['saved']);
  });

  it('tries a mark that could not be written again, and says so once', async () => {
    // Arrange
    const { probe, edited } = await editedAndWritten();
    const song = edited.tabs[1]?.editor.document?.song ?? SONG;
    mockNative.writeManifest.mockRejectedValueOnce(Object.assign(new Error('disk full'), { code: 'write_failed' }));
    const saved = workspaceReducer(edited, { type: 'saved', fileName: 'Riff.gp5', path: '/scores/Riff.gp5', song });

    // Act
    probe.update(saved);
    await elapse(0);
    const afterFailure = manifests().map((manifest) => manifest.status);
    probe.update(workspaceReducer(saved, { type: 'moveCursorBeat', step: 1 }));
    await elapse(0);

    // Assert
    expect(afterFailure).toEqual(['unsaved']);
    expect(manifests().map((manifest) => manifest.status)).toEqual(['saved']);
    expect(probe.dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'Autosave could not write the work: disk full' });
  });

  it('marks it discarded once the tab is closed with Don’t Save', async () => {
    const { probe, edited } = await editedAndWritten();
    probe.update(workspaceReducer(edited, { type: 'closeTab', tabId: 'tab-2' }));
    await elapse(0);
    expect(manifests().map((manifest) => manifest.status)).toEqual(['discarded']);
  });

  it('ends the session: every snapshot marked as its tab was answered, nothing of those tabs written after', async () => {
    // Arrange: the tab edited again since its snapshot, then let go (Don't Save) as the app quits
    const { probe, edited } = await editedAndWritten();
    const changed = workspaceReducer(edited, { type: 'setNoteFret', fret: 9 });
    probe.update(changed);

    // Act
    await ReactTestRenderer.act(() => probe.current().endSession());
    probe.update(workspaceReducer(changed, { type: 'moveCursorBeat', step: 1 }));
    await elapse(AUTOSAVE_INTERVAL_MS * 2);

    // Assert
    expect(manifests().map((manifest) => manifest.status)).toEqual(['discarded']);
    expect(mockNative.writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('says once in the hint strip when a snapshot cannot be written', async () => {
    // Arrange
    mockNative.writeSnapshot.mockRejectedValue(new Error('disk full'));
    const probe = renderAutosave(workspaceReducer(twoTabs(), { type: 'setNoteFret', fret: 7 }));

    // Act
    await elapse(AUTOSAVE_INTERVAL_MS * 3);

    // Assert
    expect(probe.dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: 'showHint', hint: 'Autosave could not write the work: disk full' }]);
  });
});

describe('useAutosave: restored work', () => {
  it('rewrites a restored snapshot as this session’s unsaved work, and does not write it again unchanged', async () => {
    // Arrange
    const restoredSong = makeSong([[beat(960, [note(1, 9)])]]);
    const old: AutosaveManifest = {
      version: 1, documentId: 'old-tab-1', title: 'Old', fileName: 'Old.gp5', path: '/scores/Old.gp5', format: 'gp5',
      savedAt: '2026-11-03T09:00:00.000Z', session: { id: 'old', pid: 99, bootId: BOOT_ID }, status: 'unsaved',
    };
    mockDisk.set('2026-11-03/old-tab-1', { base64: 'AA==', manifest: JSON.stringify(old) });
    const probe = renderAutosave(INITIAL_WORKSPACE);
    await elapse(0);

    // Act
    ReactTestRenderer.act(() => probe.current().adoptRestored(restoredSong, { folder: '2026-11-03/old-tab-1', manifest: old }));
    probe.update(workspaceReducer(INITIAL_WORKSPACE, { type: 'restoreTab', document: { fileName: 'Old.gp5', path: '/scores/Old.gp5', song: restoredSong } }));
    await elapse(AUTOSAVE_INTERVAL_MS * 2);

    // Assert
    expect(manifests()).toEqual([expect.objectContaining({ documentId: 'old-tab-1', status: 'unsaved', session: expect.objectContaining({ pid: 4242 }) })]);
    expect(mockNative.writeSnapshot).not.toHaveBeenCalled();
  });
  it('keeps this session on a restored snapshot when its tab is then saved', async () => {
    // Arrange
    const restoredSong = makeSong([[beat(960, [note(1, 9)])]]);
    const old: AutosaveManifest = {
      version: 1, documentId: 'old-tab-1', title: 'Old', fileName: 'Old.gp5', path: '/scores/Old.gp5', format: 'gp5',
      savedAt: '2026-11-03T09:00:00.000Z', session: { id: 'old', pid: 99, bootId: BOOT_ID }, status: 'declined',
    };
    mockDisk.set('2026-11-03/old-tab-1', { base64: 'AA==', manifest: JSON.stringify(old) });
    const probe = renderAutosave(INITIAL_WORKSPACE);
    await elapse(0);
    ReactTestRenderer.act(() => probe.current().adoptRestored(restoredSong, { folder: '2026-11-03/old-tab-1', manifest: old }));
    const restored = workspaceReducer(INITIAL_WORKSPACE, { type: 'restoreTab', document: { fileName: 'Old.gp5', path: '/scores/Old.gp5', song: restoredSong } });
    probe.update(restored);
    await elapse(0);

    // Act
    probe.update(workspaceReducer(restored, { type: 'saved', fileName: 'Old.gp5', path: '/scores/Old.gp5', song: restoredSong }));
    await elapse(0);

    // Assert
    expect(manifests()).toEqual([expect.objectContaining({ status: 'saved', session: expect.objectContaining({ pid: 4242 }) })]);
  });
});
