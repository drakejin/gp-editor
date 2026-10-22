import type { PdfDocument } from '../src/export/pdf-document';

const mockNative = {
  savePdf: jest.fn<Promise<{ name: string; path: string } | null>, [string, string]>(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
const mockListeners = new Map<string, () => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPPdfExport: mockNative, GPFiles: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: () => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridges read NativeModules when they load.
const { savePdf } = require('../src/native/pdf-export') as typeof import('../src/native/pdf-export');
const { subscribeExportRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

const PDF: PdfDocument = {
  title: 'Etude',
  pages: [{ width: 595, height: 842, commands: [{ kind: 'rect', x: 0, y: 0, width: 595, height: 842, color: '#FFFFFF' }] }],
};

describe('savePdf', () => {
  it('hands the document to GPPdfExport as JSON with the suggested name', async () => {
    // Arrange
    mockNative.savePdf.mockResolvedValueOnce({ name: 'Etude.pdf', path: '/Etude.pdf' });

    // Act
    const saved = await savePdf(PDF, 'Etude.pdf');

    // Assert
    expect(saved).toEqual({ name: 'Etude.pdf', path: '/Etude.pdf' });
    const [json, name] = mockNative.savePdf.mock.calls[0] ?? [];
    expect(name).toBe('Etude.pdf');
    expect(JSON.parse(json ?? 'null')).toEqual(PDF);
  });

  it('resolves null when the save panel is cancelled', async () => {
    mockNative.savePdf.mockResolvedValueOnce(null);
    await expect(savePdf(PDF, 'Etude.pdf')).resolves.toBeNull();
  });
});

describe('subscribeExportRequests', () => {
  it('calls the handler on the exportRequested event (File ▸ Export PDF…, ⌘P) until unsubscribed', () => {
    // Arrange
    const handler = jest.fn();

    // Act
    const unsubscribe = subscribeExportRequests(handler);
    mockListeners.get('exportRequested')?.();
    unsubscribe();

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockListeners.has('exportRequested')).toBe(false);
  });
});
