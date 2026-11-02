import { createContext, forwardRef, useContext, useLayoutEffect, useRef } from 'react';
import { type BlurEvent, type FocusEvent, type KeyEvent, TextInput, type TextInputProps } from 'react-native';

/**
 * A TextInput's props, less `secureTextEntry`: react-native-macos's secure field (an NSTextField with an
 * NSSecureTextFieldCell) makes AppKit throw in -[NSSecureTextView setDelegate:] — and the app abort — the moment it
 * takes focus on macOS 26.
 */
export type TextFieldProps = Omit<TextInputProps, 'secureTextEntry'>;

/**
 * Where the keyboard goes when the field that has it leaves the window (its panel closed): the window's view of the
 * score's keys (`WindowView` provides `focusScore`). react-native-macos never moves it there by itself: the field's
 * blur leaves the window itself as first responder (or nothing, when the view has already left the window and been
 * recycled), so the score's keys went nowhere until a click on the score.
 */
export const KeyboardHomeContext = createContext<() => void>(() => undefined);

/** Whether the field has the keyboard (its focus and blur events), and the keyboard sent home if it goes away with it. */
function useKeyboardHome(props: TextFieldProps) {
  const sendHome = useContext(KeyboardHomeContext);
  const isFocused = useRef(false);
  const latestHome = useRef(sendHome);
  latestHome.current = sendHome;
  useLayoutEffect(
    () => () => {
      if (isFocused.current) {
        latestHome.current();
      }
    },
    [],
  );
  const { onFocus, onBlur } = props;
  return {
    onFocus: (event: FocusEvent) => {
      isFocused.current = true;
      onFocus?.(event);
    },
    onBlur: (event: BlurEvent) => {
      isFocused.current = false;
      onBlur?.(event);
    },
  };
}

/**
 * The app's text field: a TextInput whose key events stay in it. react-native-macos sends every key typed in a field
 * to JS as a bubbling onKeyDown before typing it, and the window's root view handles the score's keys — without this,
 * typing "5" in a field would also put fret 5 on the score. Only Esc goes on, to close the panel. Never a secure field
 * (see TextFieldProps), even when the prop slips past the type. Going away with the keyboard, it gives it back to the
 * window's home (KeyboardHomeContext).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextFieldView(props, ref) {
  const { onKeyDown } = props;
  const focusEvents = useKeyboardHome(props);
  const keepKey = (event: KeyEvent) => {
    // Esc goes on, so it still closes the panel the field is in.
    if (event.nativeEvent.key !== 'Escape') {
      event.stopPropagation();
    }
    onKeyDown?.(event);
  };
  return <TextInput ref={ref} {...props} {...focusEvents} secureTextEntry={false} onKeyDown={keepKey} />;
});
