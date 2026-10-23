import type { RecentFile } from '../src/lib/recent-files';
import type { OpenedFile } from '../src/native/gp-files';

const mockNative = {
  loadRecentFiles: jest.fn<Promise<unknown>, []>(),
  saveRecentFiles: jest.fn<Promise<void>, [string, string]>(),
  readRecentFile: jest.fn<Promise<OpenedFile>, [string]>(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
const mockListeners = new Map<string, (event?: unknown) => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPRecentFiles: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: (event?: unknown) => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const bridge = require('../src/native/recent-files') as typeof import('../src/native/recent-files');

const A: RecentFile = { path: '/scores/a.gp5', name: 'a.gp5', isPinned: true, openedAt: 5, isMissing: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
});

describe('loadRecentFiles', () => {
  it('reads the stored list and keeps only well-formed files', async () => {
    mockNative.loadRecentFiles.mockResolvedValueOnce([A, { path: 'relative' }, 'junk']);
    await expect(bridge.loadRecentFiles()).resolves.toEqual([A]);
  });
});

describe('saveRecentFiles', () => {
  it('hands the list to GPRecentFiles as JSON with the file to bookmark again', async () => {
    // Arrange
    mockNative.saveRecentFiles.mockResolvedValueOnce(undefined);

    // Act
    await bridge.saveRecentFiles([A], '/scores/a.gp5');

    // Assert
    const [json, touchedPath] = mockNative.saveRecentFiles.mock.calls[0] ?? [];
    expect(JSON.parse(json ?? 'null')).toEqual([A]);
    expect(touchedPath).toBe('/scores/a.gp5');
  });

  it('bookmarks nothing again by default', async () => {
    mockNative.saveRecentFiles.mockResolvedValueOnce(undefined);
    await bridge.saveRecentFiles([]);
    expect(mockNative.saveRecentFiles).toHaveBeenCalledWith('[]', '');
  });
});

describe('readRecentFile', () => {
  it('reads a listed file through its bookmark', async () => {
    const file: OpenedFile = { name: 'a.gp5', path: '/scores/a.gp5', base64: 'AA==' };
    mockNative.readRecentFile.mockResolvedValueOnce(file);
    await expect(bridge.readRecentFile('/scores/a.gp5')).resolves.toEqual(file);
  });
});

describe('isMissingFileError', () => {
  it('is true only for the native side’s "missing" rejection', () => {
    expect(bridge.isMissingFileError(Object.assign(new Error('gone'), { code: 'missing' }))).toBe(true);
    expect(bridge.isMissingFileError(Object.assign(new Error('denied'), { code: 'read_failed' }))).toBe(false);
    expect(bridge.isMissingFileError('missing')).toBe(false);
  });
});

describe('menu events', () => {
  it('opens the path File ▸ Open Recent names, ignoring an event without one', () => {
    // Arrange
    const onOpen = jest.fn();
    const unsubscribe = bridge.subscribeOpenRecentRequests(onOpen);

    // Act
    mockListeners.get('openRecentRequested')?.({ path: '/scores/a.gp5' });
    mockListeners.get('openRecentRequested')?.({ path: 42 });
    unsubscribe();

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('/scores/a.gp5');
    expect(mockListeners.has('openRecentRequested')).toBe(false);
  });

  it('forwards Clear Menu and Recent Files… until unsubscribed', () => {
    // Arrange
    const handlers = { onClearRequested: jest.fn(), onShowRequested: jest.fn() };
    const unsubscribe = bridge.subscribeRecentListRequests(handlers);

    // Act
    mockListeners.get('clearRecentRequested')?.();
    mockListeners.get('recentFilesRequested')?.();
    unsubscribe();

    // Assert
    expect(handlers.onClearRequested).toHaveBeenCalledTimes(1);
    expect(handlers.onShowRequested).toHaveBeenCalledTimes(1);
    expect(mockListeners.size).toBe(0);
  });
});
