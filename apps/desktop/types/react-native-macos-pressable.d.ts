// react-native-macos's Pressable hands onPressMove on to Pressability (Libraries/Components/Pressable/Pressable.js), and
// its mouse events carry the modifier keys (Libraries/Types/CoreEventTypes.js), but the TypeScript types leave both out.
import 'react-native';

declare module 'react-native' {
  interface PressableProps {
    /** Called as the pointer moves while pressed (a drag). */
    onPressMove?: ((event: GestureResponderEvent) => void) | null | undefined;
  }

  interface NativeTouchEvent {
    /** macOS: shift was held when the mouse event happened. */
    shiftKey?: boolean | null | undefined;
  }
}
