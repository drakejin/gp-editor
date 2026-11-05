import ReactTestRenderer from 'react-test-renderer';
import type { StringAddress } from '@gp-editor/core';
import { type BarMenu, type BarMenuSources, useBarMenu } from '../src/hooks/use-bar-menu';

const at = (trackIndex: number, measureIndex: number): StringAddress => ({ trackIndex, measureIndex, beatIndex: 1, voiceIndex: 1, string: 3 });

/** The hook in a probe whose sources the test changes; the hook's latest value, re-read after every act(). */
function renderBarMenu(sources: Omit<BarMenuSources, 'dispatch' | 'onClosed'>) {
  const dispatch = jest.fn();
  const onClosed = jest.fn();
  let menu: BarMenu | undefined;
  function Probe(props: Omit<BarMenuSources, 'dispatch' | 'onClosed'>) {
    menu = useBarMenu({ ...props, dispatch, onClosed });
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Probe {...sources} />);
  });
  const current = () => {
    if (menu === undefined) {
      throw new Error('the hook did not run');
    }
    return menu;
  };
  const update = (next: Omit<BarMenuSources, 'dispatch' | 'onClosed'>) => ReactTestRenderer.act(() => renderer.update(<Probe {...next} />));
  return { current, update, dispatch, onClosed };
}

describe('useBarMenu', () => {
  it('puts the cursor on the right-clicked bar and opens the menu there', () => {
    // Arrange
    const menu = renderBarMenu({ tabId: 'a', trackCount: 3, cursor: at(0, 0) });

    // Act
    ReactTestRenderer.act(() => menu.current().openAt(2, 4, { x: 300, y: 650 }));

    // Assert
    expect(menu.dispatch).toHaveBeenCalledWith({ type: 'placeCursor', cursor: { trackIndex: 2, measureIndex: 4, beatIndex: 0, voiceIndex: 0, string: 3 } });
    expect(menu.current()).toMatchObject({ isOpen: true, anchor: { x: 300, y: 650 }, target: { trackIndex: 2, firstIndex: 4, lastIndex: 4, isSelection: false } });
  });

  it('keeps the selection when the right-clicked bar is one of the selected bars, and acts on them', () => {
    // Arrange
    const menu = renderBarMenu({ tabId: 'a', trackCount: 3, cursor: at(1, 5), selectionAnchor: at(1, 2) });

    // Act
    ReactTestRenderer.act(() => menu.current().openAt(1, 3, { x: 0, y: 0 }));

    // Assert
    expect(menu.dispatch).not.toHaveBeenCalled();
    expect(menu.current().target).toMatchObject({ trackIndex: 1, firstIndex: 2, lastIndex: 5, isSelection: true });
  });

  it('runs a chosen item (the cursor to its bar, then its edit) and closes, giving the keyboard back', () => {
    // Arrange
    const menu = renderBarMenu({ tabId: 'a', trackCount: 3, cursor: at(0, 0) });
    ReactTestRenderer.act(() => menu.current().openAt(1, 2, { x: 0, y: 0 }));
    menu.dispatch.mockClear();

    // Act
    ReactTestRenderer.act(() => menu.current().choose('insertAfter'));

    // Assert
    expect(menu.dispatch.mock.calls).toEqual([
      [{ type: 'placeCursor', cursor: { trackIndex: 1, measureIndex: 2, beatIndex: 0, voiceIndex: 0, string: 3 } }],
      [{ type: 'edit', edit: { type: 'insertTrackMeasure', side: 'after' } }],
    ]);
    expect(menu.current().isOpen).toBe(false);
    expect(menu.onClosed).toHaveBeenCalledTimes(1);
  });

  it('closes once, and does nothing chosen while closed', () => {
    const menu = renderBarMenu({ tabId: 'a', trackCount: 3 });
    ReactTestRenderer.act(() => menu.current().openAt(0, 0, { x: 0, y: 0 }));
    menu.dispatch.mockClear();
    ReactTestRenderer.act(() => menu.current().close());
    ReactTestRenderer.act(() => menu.current().close());
    ReactTestRenderer.act(() => menu.current().choose('deleteInTrack'));
    expect(menu.onClosed).toHaveBeenCalledTimes(1);
    expect(menu.dispatch).not.toHaveBeenCalled();
  });

  it('closes when another tab is shown or its track is gone', () => {
    // Arrange
    const menu = renderBarMenu({ tabId: 'a', trackCount: 3 });
    ReactTestRenderer.act(() => menu.current().openAt(2, 0, { x: 0, y: 0 }));

    // Act
    menu.update({ tabId: 'a', trackCount: 2 });
    const withoutTrack = menu.current().isOpen;
    menu.update({ tabId: 'a', trackCount: 3 });
    const trackBack = menu.current().isOpen;
    ReactTestRenderer.act(() => menu.current().openAt(2, 0, { x: 0, y: 0 }));
    menu.update({ tabId: 'b', trackCount: 3 });
    const inOtherTab = menu.current().isOpen;
    menu.update({ tabId: 'a', trackCount: 3 });

    // Assert
    expect([withoutTrack, trackBack, inOtherTab]).toEqual([false, false, false]);
    expect(menu.current().isOpen).toBe(false);
  });
});
