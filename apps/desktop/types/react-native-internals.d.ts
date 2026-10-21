// Types for the react-native internals this app reaches into (see src/native/focus-view.ts).
declare module 'react-native/Libraries/Components/View/ViewNativeComponent' {
  import type { View } from 'react-native';

  export const Commands: {
    focus(view: View): void;
    blur(view: View): void;
  };
}
