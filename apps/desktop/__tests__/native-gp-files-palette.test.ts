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
const { subscribeCommandPaletteRequests } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('subscribeCommandPaletteRequests', () => {
  it('opens on Expression Text when the event says so, else on the commands, until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeCommandPaletteRequests(onRequested);
    const send = mockListeners.get('commandPaletteRequested');
    send?.({ mode: 'expression' });
    send?.({});
    send?.({ mode: 'anything else' });
    send?.(undefined);
    unsubscribe();

    // Assert
    expect(onRequested.mock.calls).toEqual([['expression'], ['commands'], ['commands'], ['commands']]);
    expect(mockListeners.has('commandPaletteRequested')).toBe(false);
  });
});
