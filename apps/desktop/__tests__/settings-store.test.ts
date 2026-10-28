// A module of its own (no imports: the bridge is required after the mock), so its names stay local.
export {};

const mockNative = {
  load: jest.fn<Promise<unknown>, []>(),
  save: jest.fn<Promise<void>, [string]>(),
  applyLanguage: jest.fn<Promise<unknown>, [string, string]>(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

jest.mock('react-native', () => ({
  NativeModules: { GPAppSettings: mockNative },
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => undefined };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const store = require('../src/state/settings-store') as typeof import('../src/state/settings-store');
const i18n = require('../src/lib/i18n/i18n') as typeof import('../src/lib/i18n/i18n');

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.save.mockResolvedValue(undefined);
  mockNative.applyLanguage.mockResolvedValue({ needsRestart: false });
});

afterEach(() => i18n.setLanguage('en'));

describe('settings store', () => {
  it('loads the stored settings and shows the system’s language for “System”', async () => {
    mockNative.load.mockResolvedValueOnce({ settings: JSON.stringify({ language: 'system', contrast: 'high', paper: 'light' }), systemLanguages: ['ko-KR', 'en-US'] });

    await store.loadSettings();

    expect(store.currentSettings()).toMatchObject({ settings: { language: 'system', contrast: 'high', paper: 'light' }, systemLanguage: 'ko' });
    expect(i18n.currentLanguage()).toBe('ko');
    expect(mockNative.applyLanguage).toHaveBeenCalledWith('ko', 'system');
  });

  it('applies a chosen language at once, keeps the settings and tells listeners', async () => {
    mockNative.load.mockResolvedValueOnce({ settings: null, systemLanguages: ['ko-KR'] });
    await store.loadSettings();
    const heard = jest.fn();
    const unsubscribe = store.subscribeSettings(heard);

    await store.changeSettings({ language: 'en' });
    unsubscribe();

    expect(i18n.currentLanguage()).toBe('en');
    expect(JSON.parse(mockNative.save.mock.calls[0]?.[0] ?? '{}')).toEqual({ language: 'en', contrast: 'standard', paper: 'system', scoreZoom: 1 });
    expect(heard).toHaveBeenCalled();
  });

  it('says when macOS’s own menu items wait for a restart', async () => {
    mockNative.applyLanguage.mockResolvedValueOnce({ needsRestart: true });

    await store.changeSettings({ language: 'ko' });

    expect(store.currentSettings().needsRestart).toBe(true);
  });

  it('keeps the score’s zoom without applying the language again', async () => {
    // Act
    await store.changeScoreZoom(0.5);

    // Assert
    expect(store.currentSettings().settings.scoreZoom).toBe(0.5);
    expect(JSON.parse(mockNative.save.mock.calls.at(-1)?.[0] ?? '{}')).toMatchObject({ scoreZoom: 0.5 });
    expect(mockNative.applyLanguage).not.toHaveBeenCalled();
  });

  it('shows why the settings could not be kept', async () => {
    await store.changeSettings({ language: 'en' });
    mockNative.save.mockRejectedValueOnce(new Error('Disk full'));

    await store.changeSettings({ paper: 'dark' });

    expect(store.currentSettings().settings.paper).toBe('dark');
    expect(store.currentSettings().error).toBe('Could not keep the settings: Disk full');
  });
});
