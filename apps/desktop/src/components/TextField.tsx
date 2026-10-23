import { forwardRef } from 'react';
import { type KeyEvent, TextInput, type TextInputProps } from 'react-native';

/**
 * The app's text field: a TextInput whose key events stay in it. react-native-macos sends every key typed in a field
 * to JS as a bubbling onKeyDown before typing it, and the window's root view handles the score's keys — without this,
 * typing "5" in a field would also put fret 5 on the score. Only Esc goes on, to close the panel.
 */
export const TextField = forwardRef<TextInput, TextInputProps>(function TextFieldView(props, ref) {
  const { onKeyDown } = props;
  const keepKey = (event: KeyEvent) => {
    // Esc goes on, so it still closes the panel the field is in.
    if (event.nativeEvent.key !== 'Escape') {
      event.stopPropagation();
    }
    onKeyDown?.(event);
  };
  return <TextInput ref={ref} {...props} onKeyDown={keepKey} />;
});
