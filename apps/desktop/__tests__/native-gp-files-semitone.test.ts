import type { SemitoneDirection } from '../src/native/gp-files';

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
const { subscribeSemitoneRequests, toSemitoneDirection } = require('../src/native/gp-files') as typeof import('../src/native/gp-files');

describe('toSemitoneDirection', () => {
  it('reads up and down from the event body and nothing else', () => {
    // Arrange
    const bodies: unknown[] = [{ direction: 'up' }, { direction: 'down' }, { direction: 'sideways' }, { direction: 1 }, {}, null, 'up', undefined];

    // Act
    const directions = bodies.map(toSemitoneDirection);

    // Assert
    const expected: (SemitoneDirection | undefined)[] = ['up', 'down', undefined, undefined, undefined, undefined, undefined, undefined];
    expect(directions).toEqual(expected);
  });
});

describe('subscribeSemitoneRequests', () => {
  it('passes Edit ▸ Raise by a Semitone and Lower by a Semitone on, leaves anything else out, until unsubscribed', () => {
    // Arrange
    const onRequested = jest.fn();

    // Act
    const unsubscribe = subscribeSemitoneRequests(onRequested);
    const send = mockListeners.get('semitoneRequested');
    send?.({ direction: 'up' });
    send?.({ direction: 'octave' });
    send?.(undefined);
    send?.({ direction: 'down' });
    unsubscribe();

    // Assert
    expect(onRequested.mock.calls).toEqual([['up'], ['down']]);
    expect(mockListeners.has('semitoneRequested')).toBe(false);
  });
});
