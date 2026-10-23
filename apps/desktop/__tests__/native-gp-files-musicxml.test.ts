import { MUSICXML_FILE, MXL_FILE, fileNameIn } from '../src/lib/file-formats';

const mockNative = { addListener: jest.fn(), removeListeners: jest.fn() };
const mockListeners = new Map<string, () => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPFiles: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: () => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const { subscribeSongExportRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('subscribeSongExportRequests: MusicXML', () => {
  it('calls the MusicXML handlers on the exportMusicXmlRequested and exportCompressedMusicXmlRequested events until unsubscribed', () => {
    // Arrange
    const handlers = {
      onExportMidiRequested: jest.fn(),
      onExportAsciiTabRequested: jest.fn(),
      onExportMusicXmlRequested: jest.fn(),
      onExportCompressedMusicXmlRequested: jest.fn(),
    };

    // Act
    const unsubscribe = subscribeSongExportRequests(handlers);
    mockListeners.get('exportMusicXmlRequested')?.();
    mockListeners.get('exportCompressedMusicXmlRequested')?.();
    unsubscribe();

    // Assert
    expect(handlers.onExportMusicXmlRequested).toHaveBeenCalledTimes(1);
    expect(handlers.onExportCompressedMusicXmlRequested).toHaveBeenCalledTimes(1);
    expect(handlers.onExportMidiRequested).not.toHaveBeenCalled();
    expect(mockListeners.has('exportMusicXmlRequested')).toBe(false);
    expect(mockListeners.has('exportCompressedMusicXmlRequested')).toBe(false);
  });
});

describe('MUSICXML_FILE and MXL_FILE', () => {
  it('name the exported file after the document, with the format’s extension', () => {
    expect(fileNameIn('Song.gp5', MUSICXML_FILE)).toBe('Song.musicxml');
    expect(fileNameIn('my.song.gpx', MXL_FILE)).toBe('my.song.mxl');
  });
});
