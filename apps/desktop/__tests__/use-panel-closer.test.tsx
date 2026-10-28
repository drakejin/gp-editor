import ReactTestRenderer from 'react-test-renderer';
import { type PanelCloser, usePanelCloser } from '../src/hooks/use-panel-closer';

function renderCloser(closers: readonly PanelCloser[], onClosed: () => void): () => boolean {
  let closePanel: (() => boolean) | undefined;
  function Probe() {
    closePanel = usePanelCloser(closers, onClosed);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  if (closePanel === undefined) {
    throw new Error('the hook did not run');
  }
  return closePanel;
}

describe('usePanelCloser', () => {
  it('closes only the first open panel, then gives the keyboard back', () => {
    // Arrange
    const closeSettings = jest.fn();
    const closeTuner = jest.fn();
    const closeLyrics = jest.fn();
    const onClosed = jest.fn();
    const closePanel = renderCloser(
      [
        [false, closeSettings],
        [true, closeTuner],
        [true, closeLyrics],
      ],
      onClosed,
    );

    // Act
    const hasClosed = closePanel();

    // Assert
    expect(hasClosed).toBe(true);
    expect(closeSettings).not.toHaveBeenCalled();
    expect(closeTuner).toHaveBeenCalledTimes(1);
    expect(closeLyrics).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('answers false and leaves the keyboard alone when no panel is open', () => {
    // Arrange
    const close = jest.fn();
    const onClosed = jest.fn();
    const closePanel = renderCloser([[false, close]], onClosed);

    // Act
    const hasClosed = closePanel();

    // Assert
    expect(hasClosed).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('reads the panels of the latest render', () => {
    // Arrange
    const close = jest.fn();
    const onClosed = jest.fn();
    let closePanel: (() => boolean) | undefined;
    function Probe({ isOpen }: { readonly isOpen: boolean }) {
      closePanel = usePanelCloser([[isOpen, close]], onClosed);
      return null;
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe isOpen={false} />);
    });
    const first = closePanel;

    // Act
    ReactTestRenderer.act(() => renderer.update(<Probe isOpen />));
    const hasClosed = closePanel?.();

    // Assert
    expect(closePanel).toBe(first);
    expect(hasClosed).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
