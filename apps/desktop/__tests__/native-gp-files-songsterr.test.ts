// A module of its own (no imports): its mocks stay out of the other bridge tests' scope.
export {};

const mockNative = { addListener: jest.fn(), removeListeners: jest.fn() };
const mockListeners = new Map<string, (body?: unknown) => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPFiles: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: (body?: unknown) => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const { subscribeSongsterrRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('subscribeSongsterrRequests', () => {
  it('hands Tools ▸ Online ▸ Songsterr Search… on until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeSongsterrRequests(onRequested);
    mockListeners.get('songsterrRequested')?.();
    unsubscribe();

    // Assert
    expect(onRequested).toHaveBeenCalledTimes(1);
    expect(mockListeners.has('songsterrRequested')).toBe(false);
  });
});
