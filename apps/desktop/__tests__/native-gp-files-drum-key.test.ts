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
const { subscribeDrumKeyRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('subscribeDrumKeyRequests', () => {
  it('hands View ▸ Drum Key on until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeDrumKeyRequests(onRequested);
    mockListeners.get('drumKeyRequested')?.();
    unsubscribe();

    // Assert
    expect(onRequested).toHaveBeenCalledTimes(1);
    expect(mockListeners.has('drumKeyRequested')).toBe(false);
  });
});
