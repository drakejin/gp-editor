import type { ClipboardCommand } from '../src/native/clipboard';

const mockNative = { addListener: jest.fn(), removeListeners: jest.fn(), writeBeats: jest.fn(), readBeats: jest.fn() };
const mockListeners = new Map<string, (body?: unknown) => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPClipboard: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: (body?: unknown) => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const { subscribeClipboardRequests, toClipboardCommand } = require('../src/native/clipboard') as typeof import('../src/native/clipboard');

describe('toClipboardCommand', () => {
  it('reads cut, copy and paste from the event body and nothing else', () => {
    // Arrange
    const bodies: unknown[] = [{ command: 'cut' }, { command: 'copy' }, { command: 'paste' }, { command: 'undo' }, { command: 3 }, {}, null, 'copy', undefined];

    // Act
    const commands = bodies.map(toClipboardCommand);

    // Assert
    const expected: (ClipboardCommand | undefined)[] = ['cut', 'copy', 'paste', undefined, undefined, undefined, undefined, undefined, undefined];
    expect(commands).toEqual(expected);
  });
});

describe('subscribeClipboardRequests', () => {
  it('passes Edit ▸ Cut / Copy / Paste on, leaves anything else out, until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeClipboardRequests(onRequested);
    const send = mockListeners.get('clipboardCommandRequested');
    send?.({ command: 'copy' });
    send?.({ command: 'paste' });
    send?.({ command: 'selectAll' });
    send?.(undefined);
    send?.({ command: 'cut' });
    unsubscribe();

    // Assert
    expect(onRequested.mock.calls).toEqual([['copy'], ['paste'], ['cut']]);
    expect(mockListeners.has('clipboardCommandRequested')).toBe(false);
  });
});
