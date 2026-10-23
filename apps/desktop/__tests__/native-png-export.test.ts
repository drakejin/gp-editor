import type { PdfDocument } from '../src/export/pdf-document';
import type { SavedPngs } from '../src/native/png-export';

const mockNative = {
  savePngs: jest.fn<Promise<SavedPngs | null>, [string, readonly string[], number, string]>(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
const mockListeners = new Map<string, () => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPPngExport: mockNative, GPFiles: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: () => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridges read NativeModules when they load.
const { savePngs } = require('../src/native/png-export') as typeof import('../src/native/png-export');
const { subscribeExportPngRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');
const { PRINT_PALETTE } = require('../src/export/paper') as typeof import('../src/export/paper');

const PAGES: PdfDocument = {
  title: 'Etude',
  pages: [{ width: 595, height: 842, commands: [{ kind: 'rect', x: 0, y: 0, width: 595, height: 842, color: '#FFFFFF' }] }],
};

beforeEach(() => mockNative.savePngs.mockReset());

describe('savePngs', () => {
  it('hands the pages to GPPngExport as JSON with the file names, the pixel scale and no erasing on a white page', async () => {
    // Arrange
    const saved: SavedPngs = { folder: '/Exports', folderName: 'Exports', names: ['Etude.png'] };
    mockNative.savePngs.mockResolvedValueOnce(saved);

    // Act
    const result = await savePngs(PAGES, ['Etude.png'], { dpi: 150, isTransparent: false });

    // Assert
    expect(result).toEqual(saved);
    const [json, names, scale, eraseColor] = mockNative.savePngs.mock.calls[0] ?? [];
    expect(JSON.parse(json ?? 'null')).toEqual(PAGES);
    expect(names).toEqual(['Etude.png']);
    expect(scale).toBeCloseTo(150 / 72);
    expect(eraseColor).toBe('');
  });

  it('erases with the paper colour on a transparent background', async () => {
    mockNative.savePngs.mockResolvedValueOnce(null);
    await expect(savePngs(PAGES, ['Etude.png'], { dpi: 72, isTransparent: true })).resolves.toBeNull();
    expect(mockNative.savePngs.mock.calls[0]?.slice(2)).toEqual([1, PRINT_PALETTE.paper]);
  });
});

describe('subscribeExportPngRequests', () => {
  it('calls the handler on the exportPngRequested event (File ▸ Export PNG…) until unsubscribed', () => {
    // Arrange
    const handler = jest.fn();

    // Act
    const unsubscribe = subscribeExportPngRequests(handler);
    mockListeners.get('exportPngRequested')?.();
    unsubscribe();

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockListeners.has('exportPngRequested')).toBe(false);
  });
});
