/**
 * react-native-macos reports a right (or middle) click on a view as `onAuxClick`, at `clientX` / `clientY` in the view
 * (RCTViewComponentView.mm's emitMouseEvent): the score's beats, the bar map's cells and the curve editor's points
 * hit-test that point. A browser's click event has them in the page; this is the event the app's handlers expect.
 */

/** The fields of a DOM mouse event a right click needs. */
export interface MouseClick {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/** onAuxClick's event as react-native-macos sends it. */
export interface AuxClickEvent {
  readonly nativeEvent: MouseClick;
}

/**
 * The click as onAuxClick gets it on the Mac: its point in the view whose box starts at `box`, and `button` (a context
 * menu opened by the keyboard or a ⌃-click is the right button's).
 */
export function auxClickEvent(click: MouseClick, box: { readonly left: number; readonly top: number }, button: number = click.button): AuxClickEvent {
  const { ctrlKey, shiftKey, altKey, metaKey } = click;
  return { nativeEvent: { clientX: click.clientX - box.left, clientY: click.clientY - box.top, button, ctrlKey, shiftKey, altKey, metaKey } };
}
