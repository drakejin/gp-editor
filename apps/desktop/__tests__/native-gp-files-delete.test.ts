import type { DeleteCommand } from '../src/native/gp-files';

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
const { subscribeDeleteRequests, toDeleteCommand } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('toDeleteCommand', () => {
  it('reads notes and bars from the event body and nothing else', () => {
    // Arrange
    const bodies: unknown[] = [{ what: 'notes' }, { what: 'bars' }, { what: 'tracks' }, { what: 1 }, {}, null, 'bars', undefined];

    // Act
    const commands = bodies.map(toDeleteCommand);

    // Assert
    const expected: (DeleteCommand | undefined)[] = ['notes', 'bars', undefined, undefined, undefined, undefined, undefined, undefined];
    expect(commands).toEqual(expected);
  });
});

describe('subscribeDeleteRequests', () => {
  it('passes Edit ▸ Delete Notes and Delete Bars (⌘D) on, leaves anything else out, until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeDeleteRequests(onRequested);
    const send = mockListeners.get('deleteRequested');
    send?.({ what: 'bars' });
    send?.({ what: 'everything' });
    send?.(undefined);
    send?.({ what: 'notes' });
    unsubscribe();

    // Assert
    expect(onRequested.mock.calls).toEqual([['bars'], ['notes']]);
    expect(mockListeners.has('deleteRequested')).toBe(false);
  });
});
