import ReactTestRenderer from 'react-test-renderer';
import { type WindowChrome, useWindowChrome } from '../src/hooks/use-window-chrome';

/** The hook's latest value, re-read after every act(). */
function renderChrome(): () => WindowChrome {
  let chrome: WindowChrome | undefined;
  function Probe() {
    chrome = useWindowChrome();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => {
    if (chrome === undefined) {
      throw new Error('the hook did not run');
    }
    return chrome;
  };
}

function closeOverlay(current: () => WindowChrome): boolean {
  let isClosed = false;
  ReactTestRenderer.act(() => {
    isClosed = current().closeOverlay();
  });
  return isClosed;
}

describe('useWindowChrome: closeOverlay (Esc)', () => {
  it('closes what is on top, one press at a time', () => {
    // Arrange: the shortcut sheet, then the bend panel over it
    const current = renderChrome();
    ReactTestRenderer.act(() => {
      current().openShortcutSheet();
      current().openNotePanel('bend');
    });

    // Act + Assert
    expect(closeOverlay(current)).toBe(true);
    expect(current().notePanel).toBeUndefined();
    expect(current().isShortcutSheetOpen).toBe(true);
    expect(closeOverlay(current)).toBe(true);
    expect(current().isShortcutSheetOpen).toBe(false);
  });

  it('closes an open menu and the instrument picker', () => {
    const current = renderChrome();
    ReactTestRenderer.act(() => {
      current().openMenu('speed', 100);
      current().pickInstrument(2);
    });
    expect(closeOverlay(current)).toBe(true);
    expect(current().pickingTrackIndex).toBeUndefined();
    expect(closeOverlay(current)).toBe(true);
    expect(current().menu).toBeUndefined();
  });

  it('closes the chord panel, under a menu opened over it', () => {
    // Arrange
    const current = renderChrome();
    ReactTestRenderer.act(() => current().openChordPanel());
    const isOpen = current().isChordPanelOpen;

    // Act + Assert
    expect(isOpen).toBe(true);
    expect(closeOverlay(current)).toBe(true);
    expect(current().isChordPanelOpen).toBe(false);
    ReactTestRenderer.act(() => {
      current().openChordPanel();
      current().closeChordPanel();
    });
    expect(current().isChordPanelOpen).toBe(false);
  });

  it('reports that nothing was open', () => {
    const current = renderChrome();
    expect(closeOverlay(current)).toBe(false);
  });
});

describe('useWindowChrome: Focus / Unfocus', () => {
  it('hides every panel, then brings back the ones that were shown', () => {
    // Arrange: the tracks panel hidden
    const current = renderChrome();
    ReactTestRenderer.act(() => current().togglePanel('tracks'));
    const before = current().panels;

    // Act
    ReactTestRenderer.act(() => current().toggleFocus());
    const focused = { panels: current().panels, isFocused: current().isFocused };
    ReactTestRenderer.act(() => current().toggleFocus());

    // Assert
    expect(focused).toEqual({ panels: { palette: false, inspector: false, tracks: false, keyboard: false, neck: false }, isFocused: true });
    expect(current().panels).toEqual(before);
    expect(current().isFocused).toBe(false);
  });
});
