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

/** onAuxClick's event as react-native-macos sends it, with a synthetic event's methods (nothing to stop: already done). */
export interface AuxClickEvent {
  readonly nativeEvent: MouseClick;
  preventDefault(): void;
  stopPropagation(): void;
  persist(): void;
}

const NOTHING = (): void => undefined;

/**
 * The click as onAuxClick gets it on the Mac: its point in the view whose box starts at `box`, and `button` (a context
 * menu opened by the keyboard or a ⌃-click is the right button's).
 */
export function auxClickEvent(click: MouseClick, box: { readonly left: number; readonly top: number }, button: number = click.button): AuxClickEvent {
  const { ctrlKey, shiftKey, altKey, metaKey } = click;
  const nativeEvent = { clientX: click.clientX - box.left, clientY: click.clientY - box.top, button, ctrlKey, shiftKey, altKey, metaKey };
  return { nativeEvent, preventDefault: NOTHING, stopPropagation: NOTHING, persist: NOTHING };
}

/** A DOM mouse event as the handlers below need it. */
export interface DomClick extends MouseClick {
  preventDefault(): void;
  stopPropagation(): void;
}

/** The middle button, which browsers report as auxclick; the right one opens the context menu. */
const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

/**
 * The element's DOM handlers that call onAuxClick as react-native-macos does: its context menu (the right button, and
 * the browser's own menu kept away) and a middle click; none without a handler.
 */
export function auxClickHandlers(
  onAuxClick: ((event: AuxClickEvent) => void) | undefined,
  element: () => { getBoundingClientRect(): { readonly left: number; readonly top: number } } | null,
): { readonly onContextMenu?: (event: DomClick) => void; readonly onAuxClick?: (event: DomClick) => void } {
  if (onAuxClick === undefined) {
    return {};
  }
  const send = (event: DomClick, button: number) => {
    const node = element();
    if (node !== null) {
      event.preventDefault();
      event.stopPropagation();
      onAuxClick(auxClickEvent(event, node.getBoundingClientRect(), button));
    }
  };
  return {
    onContextMenu: (event) => send(event, RIGHT_BUTTON),
    onAuxClick: (event) => {
      if (event.button === MIDDLE_BUTTON) {
        send(event, MIDDLE_BUTTON);
      }
    },
  };
}
