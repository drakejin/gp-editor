import type { View } from 'react-native';
// Deep import: the View's native commands are not part of the public API.
// eslint-disable-next-line @react-native/no-deep-imports
import { Commands as ViewCommands } from 'react-native/Libraries/Components/View/ViewNativeComponent';

/**
 * Make a focusable View the window's first responder so it receives key events.
 * `ref.focus()` does nothing for a plain View in RN 0.83 unless the enableImperativeFocus feature flag is on;
 * the native "focus" command it would send is always handled by react-native-macos, so send it directly.
 */
export function focusView(view: View | null): void {
  if (view !== null) {
    ViewCommands.focus(view);
  }
}
