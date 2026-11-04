import ReactTestRenderer from 'react-test-renderer';
import { writeSong } from '@gp-editor/core';
import { type AutosaveManifest, type AutosaveStatus, manifestText } from '../src/autosave/autosave-manifest';
import type { AutosaveEntry } from '../src/autosave/autosave-recovery';
import type { Autosave } from '../src/hooks/use-autosave';
import { type AutosaveRecovery, useAutosaveRecovery } from '../src/hooks/use-autosave-recovery';
import { bytesToBase64 } from '../src/lib/base64';
import type { WorkspaceAction } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const mockNative = {
  listSnapshots: jest.fn<Promise<unknown>, []>(),
  runningProcesses: jest.fn(async (pids: readonly number[]) => pids.map((pid) => pid === 200)),
  readSnapshot: jest.fn<Promise<string>, [string]>(),
  removeDaysBefore: jest.fn(async (_day: string) => 0),
  revealAutosaveFolder: jest.fn(async () => undefined),
};

jest.mock('../src/native/autosave', () => ({
  isAutosaveAvailable: () => true,
  listSnapshots: () => mockNative.listSnapshots(),
  runningProcesses: (pids: readonly number[]) => mockNative.runningProcesses(pids),
  readSnapshot: (folder: string) => mockNative.readSnapshot(folder),
  removeDaysBefore: (day: string) => mockNative.removeDaysBefore(day),
  revealAutosaveFolder: () => mockNative.revealAutosaveFolder(),
}));

const SONG = makeSong([[beat(960, [note(1, 9)])]]);

function manifest(documentId: string, status: AutosaveStatus, savedAt: string, pid = 100): AutosaveManifest {
  return {
    version: 1,
    documentId,
    title: documentId,
    fileName: `${documentId}.gp5`,
    path: `/scores/${documentId}.gp5`,
    format: 'gp5',
    savedAt,
    session: { id: `session${pid}`, pid },
    status,
  };
}

function listed(day: string, value: AutosaveManifest): { folder: string; manifest: string } {
  return { folder: `${day}/${value.documentId}`, manifest: manifestText(value) };
}

/** Canon left unsaved by a crash (two days), Riff live in a running app, Etude declined, Waltz saved. */
const DISK = [
  listed('2026-11-04', manifest('canon', 'unsaved', '2026-11-04T09:00:00.000Z')),
  listed('2026-11-03', manifest('canon', 'unsaved', '2026-11-03T09:00:00.000Z')),
  listed('2026-11-04', manifest('riff', 'unsaved', '2026-11-04T09:30:00.000Z', 200)),
  listed('2026-11-02', manifest('etude', 'declined', '2026-11-02T09:00:00.000Z')),
  listed('2026-11-02', manifest('waltz', 'saved', '2026-11-02T08:00:00.000Z')),
];

interface Probe {
  readonly current: () => AutosaveRecovery;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
  readonly autosave: { readonly adoptRestored: jest.Mock; readonly markEntries: jest.Mock };
}

async function renderRecovery(): Promise<Probe> {
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  const autosave = {
    sessionId: 'me',
    endSession: jest.fn(async () => undefined),
    adoptRestored: jest.fn<void, [unknown, AutosaveEntry]>(),
    markEntries: jest.fn(async (_entries: readonly AutosaveEntry[], _status: AutosaveStatus) => undefined),
  };
  let latest: AutosaveRecovery | undefined;
  function Hook() {
    latest = useAutosaveRecovery(dispatch, autosave as Autosave);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<Hook />);
  });
  return { current: () => latest!, dispatch, autosave };
}

async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.listSnapshots.mockResolvedValue(DISK);
  mockNative.readSnapshot.mockResolvedValue(bytesToBase64(writeSong(SONG, 'gp')));
});

describe('useAutosaveRecovery: at launch', () => {
  it('removes the days kept long enough, then offers the work a crash left unsaved — not a running app’s', async () => {
    // Act
    const probe = await renderRecovery();

    // Assert
    expect(mockNative.removeDaysBefore).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(probe.current().panel?.mode).toBe('launch');
    expect(probe.current().panel?.works.map((work) => [work.documentId, work.newest.folder])).toEqual([['canon', '2026-11-04/canon']]);
  });

  it('asks nothing when no work was left unsaved', async () => {
    mockNative.listSnapshots.mockResolvedValue(DISK.slice(2));
    const probe = await renderRecovery();
    expect(probe.current().panel).toBeUndefined();
  });

  it('Restore opens each document in a tab, edited, linked to its file; its snapshot becomes this session’s', async () => {
    // Arrange
    const probe = await renderRecovery();

    // Act
    await settle(() => probe.current().restoreAll());

    // Assert
    expect(mockNative.readSnapshot).toHaveBeenCalledWith('2026-11-04/canon');
    expect(probe.dispatch).toHaveBeenCalledWith({
      type: 'restoreTab',
      document: { fileName: 'canon.gp5', path: '/scores/canon.gp5', song: expect.objectContaining({ tracks: expect.any(Array) }) },
    });
    expect(probe.autosave.adoptRestored).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ folder: '2026-11-04/canon' }));
    expect(probe.autosave.markEntries).toHaveBeenCalledWith([expect.objectContaining({ folder: '2026-11-03/canon' })], 'restored');
    expect(probe.current().panel).toBeUndefined();
  });

  it('Don’t Restore marks every snapshot of the offered work declined, so it is not asked again', async () => {
    const probe = await renderRecovery();
    await settle(() => probe.current().decline());
    expect(probe.autosave.markEntries).toHaveBeenCalledWith([expect.objectContaining({ folder: '2026-11-04/canon' }), expect.objectContaining({ folder: '2026-11-03/canon' })], 'declined');
    expect(probe.current().panel).toBeUndefined();
    expect(probe.dispatch).not.toHaveBeenCalled();
  });

  it('Esc or a click outside only closes the question: nothing is marked, the next launch asks again', async () => {
    // Arrange
    const probe = await renderRecovery();
    let wasOpen = false;

    // Act
    await settle(() => {
      wasOpen = probe.current().close();
    });

    // Assert
    expect(wasOpen).toBe(true);
    expect(probe.current().close()).toBe(false);
    expect(probe.autosave.markEntries).not.toHaveBeenCalled();
  });

  it('says why a snapshot could not be read back, and goes on with the others', async () => {
    mockNative.readSnapshot.mockRejectedValue(new Error('The autosaved work is no longer there'));
    const probe = await renderRecovery();
    await settle(() => probe.current().restoreAll());
    expect(probe.dispatch).toHaveBeenCalledWith({ type: 'loadFailed', message: 'canon: The autosaved work is no longer there' });
  });
});

describe('useAutosaveRecovery: File ▸ Recover Autosaved Work…', () => {
  it('lists the unsaved, declined and discarded work, and restores one at a time', async () => {
    // Arrange
    const probe = await renderRecovery();
    await settle(() => probe.current().close());

    // Act
    await settle(() => probe.current().openList());
    const listedIds = probe.current().panel?.works.map((work) => work.documentId);
    await settle(() => probe.current().restore('etude'));

    // Assert
    expect(probe.current().panel?.mode).toBe('list');
    expect(listedIds).toEqual(['canon', 'etude']);
    expect(probe.current().panel?.works.map((work) => work.documentId)).toEqual(['canon']);
    expect(probe.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'restoreTab' }));
  });

  it('shows the autosave folder in Finder', async () => {
    const probe = await renderRecovery();
    await settle(() => probe.current().showFolder());
    expect(mockNative.revealAutosaveFolder).toHaveBeenCalled();
  });
});
