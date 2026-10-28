import { DEFAULT_MASTER } from '@gp-editor/core';
import type { AudioExportJob, AudioExportProgress } from '../src/native/audio-export';

const mockModule = {
  exportAudio: jest.fn(() => Promise.resolve(null)),
  cancelAudioExport: jest.fn(() => Promise.resolve()),
  chooseFolder: jest.fn(() => Promise.resolve({ folder: '/Stems', folderName: 'Stems' })),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
const mockListeners = new Map<string, (event: unknown) => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPAudioExport: mockModule, GPFiles: mockModule },
  NativeEventEmitter: class {
    addListener(event: string, handler: (event: unknown) => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridges read NativeModules when they load.
const audio = require('../src/native/audio-export') as typeof import('../src/native/audio-export');
const files = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

const JOB: AudioExportJob = {
  files: [{ midi: 'TVRoZA==', seconds: 8, path: '/Music/Song.wav' }],
  mix: { tracks: [null], master: DEFAULT_MASTER },
  settings: { format: 'wav', sampleRate: 44100, bitDepth: 16, mp3Bitrate: 192, oggQuality: 6 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
});

describe('native audio export', () => {
  it('hands the job, Cancel and the folder question to GPAudioExport', async () => {
    // Arrange
    const names = ['Song - 1 Guitar.wav'];

    // Act
    await audio.exportAudio(JOB);
    await audio.cancelAudioExport();
    const folder = await audio.chooseAudioFolder(names);

    // Assert
    expect(mockModule.exportAudio).toHaveBeenCalledWith(JOB);
    expect(mockModule.cancelAudioExport).toHaveBeenCalledTimes(1);
    expect(mockModule.chooseFolder).toHaveBeenCalledWith(names);
    expect(folder).toEqual({ folder: '/Stems', folderName: 'Stems' });
  });

  it('passes checked progress events on, clamped, until unsubscribed', () => {
    // Arrange
    const received: AudioExportProgress[] = [];

    // Act
    const unsubscribe = audio.subscribeAudioExportProgress((progress) => received.push(progress));
    mockListeners.get('audioExportProgress')?.({ fileIndex: 0, fileCount: 2, fraction: 1.2 });
    mockListeners.get('audioExportProgress')?.({ fileIndex: 'one' });
    unsubscribe();

    // Assert
    expect(received).toEqual([{ fileIndex: 0, fileCount: 2, fraction: 1 }]);
    expect(mockListeners.has('audioExportProgress')).toBe(false);
  });

  it('calls the File ▸ Export Audio… handler on the exportAudioRequested event until unsubscribed', () => {
    // Arrange
    const onExportAudio = jest.fn();

    // Act
    const unsubscribe = files.subscribeExportAudioRequests(onExportAudio);
    mockListeners.get('exportAudioRequested')?.(undefined);
    unsubscribe();

    // Assert
    expect(onExportAudio).toHaveBeenCalledTimes(1);
    expect(mockListeners.has('exportAudioRequested')).toBe(false);
  });
});
