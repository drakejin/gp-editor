import ReactTestRenderer from 'react-test-renderer';
import { type RecentFiles, useRecentFiles } from '../src/hooks/use-recent-files';
import type { RecentFile } from '../src/lib/recent-files';
import type { RecentListHandlers } from '../src/native/recent-files';

const mockNative = {
  load: jest.fn<Promise<readonly RecentFile[]>, []>(),
  save: jest.fn<Promise<void>, [readonly RecentFile[], string | undefined]>(),
  listHandlers: undefined as RecentListHandlers | undefined,
};

jest.mock('../src/native/recent-files', () => ({
  loadRecentFiles: () => mockNative.load(),
  saveRecentFiles: (files: readonly RecentFile[], touchedPath?: string) => mockNative.save(files, touchedPath),
  subscribeRecentListRequests: (handlers: RecentListHandlers) => {
    mockNative.listHandlers = handlers;
    return () => {
      mockNative.listHandlers = undefined;
    };
  },
}));

const NOW = 1000;
const A: RecentFile = { path: '/scores/a.gp5', name: 'a.gp5', isPinned: false, openedAt: 2, isMissing: false };
const B: RecentFile = { path: '/scores/b.gp5', name: 'b.gp5', isPinned: false, openedAt: 1, isMissing: false };

async function renderHook(): Promise<() => RecentFiles> {
  let latest: RecentFiles | undefined;
  function Probe() {
    latest = useRecentFiles(() => NOW);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => latest!;
}

async function run(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await Promise.resolve();
  });
}

/** The list handed to the native side by the last save. */
function lastSaved(): readonly string[] {
  return (mockNative.save.mock.calls.at(-1)?.[0] ?? []).map((file) => file.name);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.load.mockResolvedValue([A, B]);
  mockNative.save.mockResolvedValue(undefined);
});

describe('useRecentFiles', () => {
  it('loads the stored list', async () => {
    const current = await renderHook();
    expect(current().files).toEqual([A, B]);
    expect(mockNative.save).not.toHaveBeenCalled();
  });

  it('puts a file just opened on top and bookmarks it afresh', async () => {
    // Arrange
    const current = await renderHook();

    // Act
    await run(() => current().remember({ path: '/scores/c.gp5', name: 'c.gp5' }));

    // Assert
    expect(current().files.map((file) => file.name)).toEqual(['c.gp5', 'a.gp5', 'b.gp5']);
    expect(current().files[0]?.openedAt).toBe(NOW);
    expect(mockNative.save).toHaveBeenLastCalledWith(current().files, '/scores/c.gp5');
  });

  it('keeps a file opened before the stored list arrived (a file from Finder at launch)', async () => {
    // Arrange
    let finishLoad: (files: readonly RecentFile[]) => void = () => undefined;
    mockNative.load.mockReturnValueOnce(new Promise((resolve) => (finishLoad = resolve)));
    let latest: RecentFiles | undefined;
    function Probe() {
      latest = useRecentFiles(() => NOW);
      return null;
    }
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<Probe />);
    });

    // Act
    await run(() => latest?.remember({ path: '/scores/c.gp5', name: 'c.gp5' }));
    expect(mockNative.save).not.toHaveBeenCalled();
    await run(() => finishLoad([A, B]));

    // Assert
    expect(latest?.files.map((file) => file.name)).toEqual(['c.gp5', 'a.gp5', 'b.gp5']);
    expect(lastSaved()).toEqual(['c.gp5', 'a.gp5', 'b.gp5']);
  });

  it('pins and unpins a file, saving the list each time', async () => {
    // Arrange
    const current = await renderHook();

    // Act
    await run(() => current().togglePin(B.path));
    const pinned = current().files;
    await run(() => current().togglePin(B.path));

    // Assert
    expect(pinned.map((file) => [file.name, file.isPinned])).toEqual([
      ['b.gp5', true],
      ['a.gp5', false],
    ]);
    expect(current().files).toEqual([A, B]);
    expect(mockNative.save).toHaveBeenCalledTimes(2);
    expect(mockNative.save).toHaveBeenLastCalledWith([A, B], '');
  });

  it('removes a file, marks one missing, and clears all but the pinned ones', async () => {
    // Arrange
    const current = await renderHook();

    // Act
    await run(() => current().markMissing(A.path));
    const marked = current().files;
    await run(() => current().togglePin(A.path));
    await run(() => current().clear());
    const cleared = current().files;
    await run(() => current().remove(A.path));

    // Assert
    expect(marked[0]?.isMissing).toBe(true);
    expect(cleared.map((file) => file.name)).toEqual(['a.gp5']);
    expect(current().files).toEqual([]);
    expect(lastSaved()).toEqual([]);
  });

  it('clears on File ▸ Open Recent ▸ Clear Menu and opens the panel on File ▸ Recent Files…', async () => {
    // Arrange
    const current = await renderHook();

    // Act
    await run(() => mockNative.listHandlers?.onClearRequested());
    await run(() => mockNative.listHandlers?.onShowRequested());

    // Assert
    expect(current().files).toEqual([]);
    expect(current().isPanelOpen).toBe(true);
    await run(() => current().closePanel());
    expect(current().isPanelOpen).toBe(false);
    await run(() => current().openPanel());
    expect(current().isPanelOpen).toBe(true);
  });

  it('reports a list that could not be read or stored, and still works without it', async () => {
    // Arrange
    mockNative.load.mockRejectedValueOnce(new Error('defaults unreadable'));
    const current = await renderHook();
    expect(current().error).toBe('defaults unreadable');
    mockNative.save.mockRejectedValueOnce(new Error('defaults full'));

    // Act
    await run(() => current().remember({ path: '/scores/c.gp5', name: 'c.gp5' }));

    // Assert
    expect(current().files.map((file) => file.name)).toEqual(['c.gp5']);
    expect(current().error).toBe('defaults full');
    await run(() => current().dismissError());
    expect(current().error).toBeUndefined();
  });

  it('saves nothing when a change leaves the list as it was', async () => {
    const current = await renderHook();
    await run(() => current().togglePin('/elsewhere/x.gp5'));
    await run(() => current().remember({ path: '', name: 'Untitled.gp5' }));
    expect(mockNative.save).not.toHaveBeenCalled();
  });
});
