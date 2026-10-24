import ReactTestRenderer from 'react-test-renderer';

const mockNative = { addListener: jest.fn(), removeListeners: jest.fn(), fontFamilies: jest.fn() };
const mockListeners = new Map<string, (body?: unknown) => void>();

jest.mock('react-native', () => ({
  NativeModules: { GPStylesheet: mockNative },
  NativeEventEmitter: class {
    addListener(event: string, handler: (body?: unknown) => void) {
      mockListeners.set(event, handler);
      return { remove: () => mockListeners.delete(event) };
    }
  },
}));

// Imported after the mock: the bridge reads NativeModules when it loads.
const { fontFamilies, subscribeLayoutCommands } = require('../src/native/stylesheet') as typeof import('../src/native/stylesheet');
const { useScoreDesign } = require('../src/hooks/use-score-design') as typeof import('../src/hooks/use-score-design');

describe('the stylesheet’s native module', () => {
  it('lists the installed families without the hidden system ones', async () => {
    mockNative.fontFamilies.mockResolvedValueOnce(['Georgia', '.SF NS', '', 'Menlo']);
    await expect(fontFamilies()).resolves.toEqual(['Georgia', 'Menlo']);
  });

  it('forwards the menus’ layout commands it knows until unsubscribed', () => {
    // Arrange
    const onCommand = jest.fn();

    // Act
    const unsubscribe = subscribeLayoutCommands(onCommand);
    const send = mockListeners.get('layoutCommandRequested');
    send?.({ command: 'designMode' });
    send?.({ command: 'erase' });
    unsubscribe();

    // Assert
    expect(onCommand.mock.calls).toEqual([['designMode']]);
    expect(mockListeners.has('layoutCommandRequested')).toBe(false);
  });
});

describe('useScoreDesign', () => {
  function renderDesign(hasDocument: boolean) {
    const dispatch = jest.fn();
    const onClosed = jest.fn();
    let design: ReturnType<typeof useScoreDesign> | undefined;
    function Probe() {
      design = useScoreDesign(hasDocument, dispatch, onClosed);
      return null;
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe />);
    });
    return { current: () => design!, dispatch, onClosed, unmount: () => ReactTestRenderer.act(() => renderer.unmount()) };
  }

  it('opens the stylesheet from File ▸ Stylesheet…, turns Design Mode on and resets positions from the View menu', () => {
    // Arrange
    const hook = renderDesign(true);
    const send = mockListeners.get('layoutCommandRequested');

    // Act
    ReactTestRenderer.act(() => send?.({ command: 'stylesheet' }));
    const isOpen = hook.current().isStylesheetOpen;
    ReactTestRenderer.act(() => send?.({ command: 'designMode' }));
    ReactTestRenderer.act(() => send?.({ command: 'resetPositions' }));
    ReactTestRenderer.act(() => hook.current().closeStylesheet());

    // Assert
    expect(isOpen).toBe(true);
    expect(hook.dispatch.mock.calls).toEqual([[{ type: 'toggleDesignMode' }], [{ type: 'resetPositions' }]]);
    expect(hook.current().isStylesheetOpen).toBe(false);
    expect(hook.onClosed).toHaveBeenCalled();
    hook.unmount();
  });

  it('opens nothing without a document', () => {
    const hook = renderDesign(false);
    ReactTestRenderer.act(() => hook.current().openStylesheet());
    expect(hook.current().isStylesheetOpen).toBe(false);
    hook.unmount();
  });
});
