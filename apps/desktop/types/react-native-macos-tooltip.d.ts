// react-native-macos draws `tooltip` on View and Pressable (the NSView's help tag, see RCTViewComponentView.mm), but its
// TypeScript types leave the prop out. Pressable's props extend ViewProps, so this covers both.
import 'react-native';

declare module 'react-native' {
  interface ViewPropsMacOS {
    /** macOS: the help tag shown when the pointer rests on the view. */
    tooltip?: string | undefined;
  }
}
