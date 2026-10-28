/**
 * `react-native` for the Windows (Tauri) build: react-native-web, with the react-native-macos props this app relies on
 * made to work in a browser view (WebView2). Vite aliases the bare `react-native` import here (vite.config.ts); the
 * macOS build never sees this file.
 *
 * - Pressable is rebuilt on pointer events: press events carry `locationX` / `locationY` (where the pointer is in the
 *   pressable, which react-native-web's press events lack), `onPressMove` follows a drag beyond the view (pointer
 *   capture), and the innermost pressable takes the press, as in React Native.
 * - `tooltip` (react-native-macos) becomes the element's `title`; a pressable's role stays an attribute (no nested
 *   <button>s).
 * - TextInput calls `onKeyDown` and lets the keys it does not stop bubble on, as react-native-macos does.
 * - Text shows macOS key symbols (⌘, ⇧, ⌥ …) the Windows way (platform-text.ts).
 */
import {
  type ComponentType,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
  type RefAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as Web from 'react-native-web';
import { platformText } from './platform-text';

export * from 'react-native-web';

type StyleValue = unknown;

/**
 * react-native-web's View and Text, typed as loosely as this file's own props: the app's props are typed against
 * react-native-macos (tsconfig.web.json), and @types/react-native-web's View props are not even its own.
 */
type WebComponent = ComponentType<{ readonly [prop: string]: unknown } & RefAttributes<HTMLElement>>;
const BaseView = Web.View as unknown as WebComponent;
const BaseText = Web.Text as unknown as WebComponent;
const BaseTextInput = Web.TextInput as unknown as WebComponent;

interface PressState {
  readonly pressed: boolean;
  readonly hovered: boolean;
}

interface Insets {
  readonly top?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
}

/** What a press handler gets: the fields of a React Native press event this app reads. */
export interface WebPressEvent {
  readonly nativeEvent: {
    readonly locationX: number;
    readonly locationY: number;
    readonly pageX: number;
    readonly pageY: number;
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly timestamp: number;
  };
  readonly currentTarget: HTMLElement;
  readonly target: EventTarget | null;
  stopPropagation(): void;
  preventDefault(): void;
  persist(): void;
}

type PressHandler = (event: WebPressEvent) => void;

interface PressableProps {
  readonly children?: ReactNode | ((state: PressState) => ReactNode);
  readonly style?: StyleValue | ((state: PressState) => StyleValue);
  readonly disabled?: boolean | null;
  readonly onPress?: PressHandler;
  readonly onPressIn?: PressHandler;
  readonly onPressMove?: PressHandler;
  readonly onPressOut?: PressHandler;
  readonly onLongPress?: PressHandler;
  readonly onHoverIn?: (event: unknown) => void;
  readonly onHoverOut?: (event: unknown) => void;
  readonly pressRetentionOffset?: Insets | number;
  readonly tooltip?: string;
  readonly testID?: string;
  readonly accessibilityRole?: unknown;
  readonly role?: unknown;
  readonly [prop: string]: unknown;
}

const DEFAULT_RETENTION = 20;

function pressEvent(event: PointerEvent | MouseEvent, element: HTMLElement): WebPressEvent {
  const box = element.getBoundingClientRect();
  return {
    nativeEvent: {
      locationX: event.clientX - box.left,
      locationY: event.clientY - box.top,
      pageX: event.pageX,
      pageY: event.pageY,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      timestamp: event.timeStamp,
    },
    currentTarget: element,
    target: event.target,
    stopPropagation: () => event.stopPropagation(),
    preventDefault: () => event.preventDefault(),
    persist: () => undefined,
  };
}

function isInside(event: PointerEvent, element: HTMLElement, retention: Insets | number | undefined): boolean {
  const box = element.getBoundingClientRect();
  const inset = (side: keyof Insets) => (typeof retention === 'number' ? retention : retention?.[side] ?? DEFAULT_RETENTION);
  return (
    event.clientX >= box.left - inset('left') &&
    event.clientX <= box.right + inset('right') &&
    event.clientY >= box.top - inset('top') &&
    event.clientY <= box.bottom + inset('bottom')
  );
}

/** Sets (or removes) an attribute of the element behind a react-native-web view. */
function useAttribute(element: { current: HTMLElement | null }, name: string, value: string | undefined): void {
  useEffect(() => {
    const node = element.current;
    if (node === null) {
      return;
    }
    if (value === undefined || value === '') {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, value);
    }
  }, [element, name, value]);
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null) {
    ref.current = value;
  }
}

/** The press handlers of one pressable: pointer down / move / up, with the pointer captured while pressed. */
function usePress(props: PressableProps, element: { current: HTMLElement | null }) {
  const [pressed, setPressed] = useState(false);
  const pointerId = useRef<number | undefined>(undefined);
  const isDisabled = props.disabled === true;
  const latest = useRef(props);
  latest.current = props;

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      const node = element.current;
      if (isDisabled || node === null || event.button !== 0 || pointerId.current !== undefined) {
        return;
      }
      // The innermost pressable takes the press (React Native's responder does the same).
      event.stopPropagation();
      pointerId.current = event.pointerId;
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that is already gone cannot be captured; the press still works inside the view.
      }
      setPressed(true);
      latest.current.onPressIn?.(pressEvent(event, node));
    },
    [element, isDisabled],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const node = element.current;
      if (node !== null && pointerId.current === event.pointerId) {
        latest.current.onPressMove?.(pressEvent(event, node));
      }
    },
    [element],
  );
  const finish = useCallback(
    (event: PointerEvent, isCancelled: boolean) => {
      const node = element.current;
      if (node === null || pointerId.current !== event.pointerId) {
        return;
      }
      pointerId.current = undefined;
      setPressed(false);
      const press = pressEvent(event, node);
      latest.current.onPressOut?.(press);
      if (!isCancelled && isInside(event, node, latest.current.pressRetentionOffset)) {
        latest.current.onPress?.(press);
      }
    },
    [element],
  );
  return {
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent) => finish(event, false),
      onPointerCancel: (event: PointerEvent) => finish(event, true),
    },
  };
}

function resolve<T>(value: T | ((state: PressState) => T), state: PressState): T {
  return typeof value === 'function' ? (value as (state: PressState) => T)(state) : value;
}

const PRESSABLE_STYLE: CSSProperties = { cursor: 'default', userSelect: 'none', touchAction: 'none' };

/** React Native's Pressable on pointer events (see the file comment). */
export const Pressable = forwardRef<HTMLElement, PressableProps>(function WebPressable(props, ref) {
  const {
    children,
    style,
    disabled,
    /* eslint-disable @typescript-eslint/no-unused-vars -- usePress reads these; they stay off the DOM view */
    onPress,
    onPressIn,
    onPressMove,
    onPressOut,
    onLongPress,
    pressRetentionOffset,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    onHoverIn,
    onHoverOut,
    tooltip,
    accessibilityRole,
    role,
    ...rest
  } = props as PressableProps; // forwardRef's PropsWithoutRef turns the named props into `unknown` (index signature)
  const element = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const { pressed, handlers } = usePress(props, element);
  useAttribute(element, 'title', tooltip === undefined ? undefined : platformText(tooltip));
  // The role as an attribute: react-native-web makes a "button" role a <button>, and the app nests pressables (a tab's
  // close button in the tab), which HTML does not allow for buttons.
  useAttribute(element, 'role', typeof (role ?? accessibilityRole) === 'string' ? String(role ?? accessibilityRole) : undefined);
  const state: PressState = { pressed, hovered };
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  return (
    <BaseView
      {...rest}
      ref={setRef}
      aria-disabled={disabled === true ? true : undefined}
      style={[PRESSABLE_STYLE, resolve(style, state)]}
      onPointerEnter={(event: unknown) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onPointerLeave={(event: unknown) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      {...handlers}
    >
      {resolve(children, state)}
    </BaseView>
  );
});

interface ViewProps {
  readonly tooltip?: string;
  readonly children?: ReactNode;
  readonly [prop: string]: unknown;
}

/** react-native-web's View, with react-native-macos's `tooltip`. */
export const View = forwardRef<HTMLElement, ViewProps>(function WebView(props, ref) {
  const { tooltip, ...rest } = props as ViewProps;
  const element = useRef<HTMLElement | null>(null);
  useAttribute(element, 'title', tooltip === undefined ? undefined : platformText(tooltip));
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  return <BaseView {...rest} ref={setRef} />;
});

interface TextProps {
  readonly children?: ReactNode;
  readonly [prop: string]: unknown;
}

function translateChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    return platformText(children);
  }
  if (Array.isArray(children)) {
    return children.map((child: ReactNode) => (typeof child === 'string' ? platformText(child) : child));
  }
  return children;
}

/** react-native-web's Text; texts written for the Mac (⌘ keys, System Settings) read as on Windows. */
export const Text = forwardRef<HTMLElement, TextProps>(function WebText(props, ref) {
  const { children, ...rest } = props as TextProps;
  return (
    <BaseText {...rest} ref={ref}>
      {translateChildren(children)}
    </BaseText>
  );
});

/** What a TextInput's onKeyDown gets: the fields of a React Native key event this app reads. */
interface WebKeyEvent {
  readonly nativeEvent: KeyboardEvent;
  readonly target: EventTarget | null;
  stopPropagation(): void;
  preventDefault(): void;
}

interface TextInputProps {
  readonly onKeyDown?: (event: WebKeyEvent) => void;
  readonly onKeyPress?: (event: unknown) => void;
  readonly [prop: string]: unknown;
}

/** A key the input did not keep, sent on from its parent as if it had bubbled there (as in react-native-macos). */
function bubbleFrom(input: HTMLElement, key: KeyboardEvent): void {
  const { key: name, code, ctrlKey, shiftKey, altKey, metaKey, repeat } = key;
  input.parentElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, code, ctrlKey, shiftKey, altKey, metaKey, repeat, bubbles: true, cancelable: true }));
}

/**
 * react-native-web's TextInput with react-native-macos's key events: react-native-web stops every keydown in the input
 * and never calls `onKeyDown`. Here `onKeyDown` gets each key first (the command palette's ↑ ↓ ↩), and a key it does not
 * stop goes on to the views above, as react-native-macos bubbles it (TextField lets Esc through to close its panel).
 * The macOS-only key lists (`keyDownEvents` …) stay off the DOM.
 */
export const TextInput = forwardRef<HTMLElement, TextInputProps>(function WebTextInput(props, ref) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- macOS-only props, kept off the DOM
  const { onKeyDown, onKeyPress, keyDownEvents, keyUpEvents, validKeysDown, validKeysUp, ...rest } = props as TextInputProps;
  const handleKeyPress = (event: { readonly nativeEvent: KeyboardEvent; readonly currentTarget: HTMLElement; preventDefault(): void }) => {
    onKeyPress?.(event);
    if (onKeyDown === undefined) {
      return;
    }
    let isStopped = false;
    onKeyDown({ nativeEvent: event.nativeEvent, target: event.nativeEvent.target, stopPropagation: () => (isStopped = true), preventDefault: () => event.preventDefault() });
    if (!isStopped) {
      bubbleFrom(event.currentTarget, event.nativeEvent);
    }
  };
  return <BaseTextInput {...rest} ref={ref} onKeyPress={handleKeyPress} />;
});

/** Codegen components (the macOS score canvas) do not exist here; src/native/*.web.tsx replace them. */
export function codegenNativeComponent(name: string): never {
  throw new Error(`Native component ${name} is not available in the Windows build`);
}
