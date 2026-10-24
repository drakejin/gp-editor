import { forwardRef } from 'react';
import { type KeyEvent, TextInput, type TextInputProps } from 'react-native';

/**
 * A TextInput's props, less `secureTextEntry`: react-native-macos's secure field (an NSTextField with an
 * NSSecureTextFieldCell) makes AppKit throw in -[NSSecureTextView setDelegate:] — and the app abort — the moment it
 * takes focus on macOS 26.
 */
export type TextFieldProps = Omit<TextInputProps, 'secureTextEntry'>;

/**
 * The app's text field: a TextInput whose key events stay in it. react-native-macos sends every key typed in a field
 * to JS as a bubbling onKeyDown before typing it, and the window's root view handles the score's keys — without this,
 * typing "5" in a field would also put fret 5 on the score. Only Esc goes on, to close the panel. Never a secure field
 * (see TextFieldProps), even when the prop slips past the type.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextFieldView(props, ref) {
  const { onKeyDown } = props;
  const keepKey = (event: KeyEvent) => {
    // Esc goes on, so it still closes the panel the field is in.
    if (event.nativeEvent.key !== 'Escape') {
      event.stopPropagation();
    }
    onKeyDown?.(event);
  };
  return <TextInput ref={ref} {...props} secureTextEntry={false} onKeyDown={keepKey} />;
});
