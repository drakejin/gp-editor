// react-native-macos's Pressable hands onPressMove on to Pressability (Libraries/Components/Pressable/Pressable.js), and
// its mouse events carry the modifier keys (Libraries/Types/CoreEventTypes.js), but the TypeScript types leave both out.
// A right click never presses a Pressable: the view reports it as onAuxClick (ViewPropTypes.js, RCTViewComponentView.mm).
import 'react-native';

declare module 'react-native' {
  interface PressableProps {
    /** Called as the pointer moves while pressed (a drag). */
    onPressMove?: ((event: GestureResponderEvent) => void) | null | undefined;
    /** macOS: a right (or middle) click on the view, at clientX / clientY in the view. */
    onAuxClick?: ((event: NativeSyntheticEvent<NativeMouseEvent>) => void) | null | undefined;
  }

  interface NativeTouchEvent {
    /** macOS: shift was held when the mouse event happened. */
    shiftKey?: boolean | null | undefined;
    /** macOS: control was held (a ⌃-click, which macOS takes as a right click). */
    ctrlKey?: boolean | null | undefined;
  }
}
