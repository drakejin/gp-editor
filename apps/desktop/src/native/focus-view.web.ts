import type { View } from 'react-native';

/** Windows twin of focus-view.ts: a react-native-web View is its DOM element; focusing it routes the keys to it. */
export function focusView(view: View | null): void {
  const element = view as unknown as HTMLElement | null;
  element?.focus({ preventScroll: true });
}
