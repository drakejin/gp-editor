import { writeSong } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { type DocumentCommands, type RecentFileHandlers, useDocument } from '../src/hooks/use-document';
import { bytesToBase64 } from '../src/lib/base64';
import type { ChosenFile, OpenedFile, SavePanelOptions, SavedFile } from '../src/native/gp-files';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';
import { beat, makeSong, note } from '../test-support/songs';

const mockFiles = {
  showOpenDialog: jest.fn<Promise<OpenedFile | null>, []>(),
  readFile: jest.fn<Promise<OpenedFile>, [string]>(),
  showSavePanel: jest.fn<Promise<ChosenFile | null>, [SavePanelOptions]>(),
  writeFile: jest.fn<Promise<SavedFile>, [string, string]>(),
  readRecentFile: jest.fn<Promise<OpenedFile>, [string]>(),
  onOpenRecent: undefined as ((path: string) => void) | undefined,
};

jest.mock('../src/native/gp-files', () => ({
  showOpenDialog: () => mockFiles.showOpenDialog(),
  readFile: (pathOrUrl: string) => mockFiles.readFile(pathOrUrl),
  showSavePanel: (options: SavePanelOptions) => mockFiles.showSavePanel(options),
  writeFile: (path: string, base64: string) => mockFiles.writeFile(path, base64),
  setDocumentTitle: () => undefined,
  subscribeFileEvents: () => () => undefined,
}));

jest.mock('../src/native/recent-files', () => ({
  readRecentFile: (path: string) => mockFiles.readRecentFile(path),
  isMissingFileError: (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === 'missing',
  subscribeOpenRecentRequests: (handler: (path: string) => void) => {
    mockFiles.onOpenRecent = handler;
    return () => {
      mockFiles.onOpenRecent = undefined;
    };
  },
}));

const SONG = makeSong([[beat(960, [note(1, 3)])]]);
const ETUDE: OpenedFile = { name: 'Etude.gp5', path: '/scores/Etude.gp5', base64: bytesToBase64(writeSong(SONG, 'gp5')) };

interface Probe {
  readonly current: () => DocumentCommands;
  readonly dispatch: jest.Mock<void, [WorkspaceAction]>;
  readonly recent: { readonly remember: jest.Mock; readonly markMissing: jest.Mock };
}

function renderHook(workspace: WorkspaceState = INITIAL_WORKSPACE): Probe {
  const dispatch = jest.fn<void, [WorkspaceAction]>();
  const recent = { remember: jest.fn(), markMissing: jest.fn() };
  const handlers: RecentFileHandlers = recent;
  let latest: DocumentCommands | undefined;
  function Hook() {
    latest = useDocument(workspace, dispatch, undefined, handlers);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Hook />);
  });
  return { current: () => latest!, dispatch, recent };
}

async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useDocument and the recent files', () => {
  it('remembers a file opened through the open panel, dropped or handed over by Finder', async () => {
    // Arrange
    mockFiles.showOpenDialog.mockResolvedValueOnce(ETUDE);
    mockFiles.readFile.mockResolvedValueOnce({ ...ETUDE, name: 'Other.gp5', path: '/scores/Other.gp5' });
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openDialog());
    await settle(() => hook.current().openPath('/scores/Other.gp5'));

    // Assert
    expect(hook.recent.remember.mock.calls).toEqual([
      [{ path: '/scores/Etude.gp5', name: 'Etude.gp5' }, undefined],
      [{ path: '/scores/Other.gp5', name: 'Other.gp5' }, undefined],
    ]);
  });

  it('does not remember a file that is not a Guitar Pro file', async () => {
    mockFiles.readFile.mockResolvedValueOnce({ ...ETUDE, base64: bytesToBase64(new Uint8Array([1, 2, 3, 4])) });
    const hook = renderHook();
    await settle(() => hook.current().openPath('/scores/Etude.gp5'));
    expect(hook.recent.remember).not.toHaveBeenCalled();
  });

  it('remembers the file a tab was saved to', async () => {
    // Arrange
    const workspace = workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: 'Song.gpx', path: '/scores/Song.gpx', song: SONG } });
    mockFiles.showSavePanel.mockResolvedValueOnce({ name: 'Song.gp5', path: '/scores/Song.gp5', formatId: 'gp5' });
    mockFiles.writeFile.mockResolvedValueOnce({ name: 'Song.gp5', path: '/scores/Song.gp5' });
    const hook = renderHook(workspace);

    // Act
    await settle(() => hook.current().save(false));

    // Assert
    expect(hook.recent.remember).toHaveBeenCalledWith({ path: '/scores/Song.gp5', name: 'Song.gp5' });
  });

  it('opens a recent file through its bookmark in a new tab, as File ▸ Open does', async () => {
    // Arrange
    mockFiles.readRecentFile.mockResolvedValueOnce(ETUDE);
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openRecent('/scores/Etude.gp5'));

    // Assert
    expect(mockFiles.readRecentFile).toHaveBeenCalledWith('/scores/Etude.gp5');
    expect(hook.dispatch.mock.calls.map(([action]) => action.type)).toEqual(['loadStarted', 'loaded']);
    expect(hook.recent.remember).toHaveBeenCalledWith({ path: '/scores/Etude.gp5', name: 'Etude.gp5' }, undefined);
  });

  it('opens a file chosen in File ▸ Open Recent', async () => {
    mockFiles.readRecentFile.mockResolvedValueOnce(ETUDE);
    const hook = renderHook();
    await settle(() => mockFiles.onOpenRecent?.('/scores/Etude.gp5'));
    expect(hook.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'loaded' }));
  });

  it('remembers where a recent file moved to, in place of where it was', async () => {
    mockFiles.readRecentFile.mockResolvedValueOnce({ ...ETUDE, path: '/moved/Etude.gp5' });
    const hook = renderHook();
    await settle(() => hook.current().openRecent('/scores/Etude.gp5'));
    expect(hook.recent.remember).toHaveBeenCalledWith({ path: '/moved/Etude.gp5', name: 'Etude.gp5' }, '/scores/Etude.gp5');
  });

  it('marks a recent file that is gone as missing and says so', async () => {
    // Arrange
    mockFiles.readRecentFile.mockRejectedValueOnce(Object.assign(new Error('“Etude.gp5” is missing'), { code: 'missing' }));
    const hook = renderHook();

    // Act
    await settle(() => hook.current().openRecent('/scores/Etude.gp5'));

    // Assert
    expect(hook.recent.markMissing).toHaveBeenCalledWith('/scores/Etude.gp5');
    expect(hook.dispatch).toHaveBeenLastCalledWith({ type: 'loadFailed', message: '“Etude.gp5” is missing' });
    expect(hook.recent.remember).not.toHaveBeenCalled();
  });

  it('keeps a recent file that could not be read for another reason', async () => {
    mockFiles.readRecentFile.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'read_failed' }));
    const hook = renderHook();
    await settle(() => hook.current().openRecent('/scores/Etude.gp5'));
    expect(hook.recent.markMissing).not.toHaveBeenCalled();
    expect(hook.dispatch).toHaveBeenLastCalledWith({ type: 'loadFailed', message: 'Permission denied' });
  });
});
