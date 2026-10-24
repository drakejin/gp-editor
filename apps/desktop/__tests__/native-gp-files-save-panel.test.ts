import { SAVE_FORMATS } from '../src/lib/file-formats';
import { setLanguage } from '../src/lib/i18n/i18n';

const mockSavePanel = { showSavePanel: jest.fn(() => Promise.resolve(null)) };

jest.mock('react-native', () => ({
  NativeModules: { GPFiles: mockSavePanel },
  NativeEventEmitter: class {},
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const { showSavePanel } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

afterEach(() => setLanguage('en'));

describe('showSavePanel', () => {
  it('hands the native panel plain formats, their notes in the language shown now', async () => {
    // Arrange
    setLanguage('ko');

    // Act
    await showSavePanel({ suggestedName: 'Song.gp4', formats: SAVE_FORMATS, formatId: 'gp4' });

    // Assert
    const sent = mockSavePanel.showSavePanel.mock.calls[0] as unknown as [{ formats: readonly Record<string, unknown>[] }];
    const gp4 = sent[0].formats[2];
    expect(sent[0].formats[0]).toEqual({ id: 'gp5', label: 'Guitar Pro 5 (.gp5)', extension: 'gp5' });
    expect(Object.getOwnPropertyDescriptor(gp4, 'note')?.get).toBeUndefined();
    expect(gp4?.note).toMatch(/^Guitar Pro 4 파일은/);
  });
});
