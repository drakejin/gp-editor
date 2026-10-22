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

  it('reports that nothing was open', () => {
    const current = renderChrome();
    expect(closeOverlay(current)).toBe(false);
  });
});
