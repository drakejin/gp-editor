import { auxClickEvent, auxClickHandlers } from '../web/aux-click';

describe('auxClickEvent (the Windows build’s right click)', () => {
  it('gives the point in the view, as react-native-macos’s onAuxClick does, with the button and the keys', () => {
    // Arrange: a right click at (230, 610) in the page on a view whose box starts at (200, 600)
    const click = { clientX: 230, clientY: 610, button: 2, ctrlKey: false, shiftKey: true, altKey: false, metaKey: false };

    // Act
    const event = auxClickEvent(click, { left: 200, top: 600 });

    // Assert
    expect(event.nativeEvent).toEqual({ clientX: 30, clientY: 10, button: 2, ctrlKey: false, shiftKey: true, altKey: false, metaKey: false });
  });

  it('takes the button it is given (a context menu opened by a ⌃-click is the right button’s)', () => {
    const click = { clientX: 5, clientY: 5, button: 0, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
    expect(auxClickEvent(click, { left: 0, top: 0 }, 2).nativeEvent).toMatchObject({ button: 2, ctrlKey: true });
  });
});

describe('auxClickHandlers (the Windows Pressable’s right and middle clicks)', () => {
  const box = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
  const click = (button: number) => ({ clientX: 130, clientY: 70, button, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, preventDefault: jest.fn(), stopPropagation: jest.fn() });

  it('calls onAuxClick once for the context menu (the right button), at the point in the view, the browser’s menu kept away', () => {
    // Arrange
    const onAuxClick = jest.fn();
    const handlers = auxClickHandlers(onAuxClick, () => box);
    const event = click(2);

    // Act: a right click fires contextmenu, and auxclick with the right button too
    handlers.onContextMenu?.(event);
    handlers.onAuxClick?.(click(2));

    // Assert
    expect(onAuxClick).toHaveBeenCalledTimes(1);
    expect(onAuxClick.mock.calls[0][0].nativeEvent).toMatchObject({ clientX: 30, clientY: 20, button: 2 });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('calls onAuxClick for a middle click with the middle button', () => {
    const onAuxClick = jest.fn();
    auxClickHandlers(onAuxClick, () => box).onAuxClick?.(click(1));
    expect(onAuxClick.mock.calls[0][0].nativeEvent.button).toBe(1);
  });

  it('adds no handler without onAuxClick, and does nothing once the element is gone', () => {
    const onAuxClick = jest.fn();
    expect(auxClickHandlers(undefined, () => box)).toEqual({});
    auxClickHandlers(onAuxClick, () => null).onContextMenu?.(click(2));
    expect(onAuxClick).not.toHaveBeenCalled();
  });

  it('gives an event a handler may call preventDefault on, as on the Mac', () => {
    const event = auxClickEvent(click(2), { left: 0, top: 0 });
    expect(() => {
      event.preventDefault();
      event.stopPropagation();
      event.persist();
    }).not.toThrow();
  });
});
