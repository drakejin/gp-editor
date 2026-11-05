import { auxClickEvent } from '../web/aux-click';

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
