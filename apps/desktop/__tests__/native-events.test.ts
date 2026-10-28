type MockListener = (body: unknown) => void;
const mockEmitters: { module: object; listeners: Map<string, MockListener> }[] = [];

jest.mock('react-native', () => ({
  NativeEventEmitter: class {
    private readonly listeners = new Map<string, MockListener>();
    constructor(module: object) {
      mockEmitters.push({ module, listeners: this.listeners });
    }
    addListener(event: string, listener: MockListener) {
      this.listeners.set(event, listener);
      return { remove: () => this.listeners.delete(event) };
    }
  },
}));

// Imported after the mock.
const { subscribeNativeEvents } = require('../src/native/native-events') as typeof import('../src/native/native-events');

beforeEach(() => {
  mockEmitters.length = 0;
});

describe('subscribeNativeEvents', () => {
  it('hands each event to its listener until unsubscribed', () => {
    // Arrange
    const module = {};
    const opened = jest.fn();
    const saved = jest.fn();

    // Act
    const unsubscribe = subscribeNativeEvents(module, { fileOpened: opened, saveRequested: saved });
    mockEmitters[0]?.listeners.get('fileOpened')?.({ path: '/a.gp5' });
    unsubscribe();

    // Assert
    expect(opened).toHaveBeenCalledWith({ path: '/a.gp5' });
    expect(saved).not.toHaveBeenCalled();
    expect(mockEmitters[0]?.listeners.size).toBe(0);
  });

  it('keeps one emitter per module', () => {
    // Arrange
    const module = {};

    // Act
    subscribeNativeEvents(module, { a: jest.fn() });
    subscribeNativeEvents(module, { b: jest.fn() });
    subscribeNativeEvents({}, { c: jest.fn() });

    // Assert
    expect(mockEmitters).toHaveLength(2);
  });

  it('listens to nothing where the module is missing', () => {
    // Act
    const unsubscribe = subscribeNativeEvents(undefined, { fileOpened: jest.fn() });
    unsubscribe();

    // Assert
    expect(mockEmitters).toHaveLength(0);
  });
});
