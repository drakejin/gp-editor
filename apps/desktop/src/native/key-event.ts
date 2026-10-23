import type { KeyEvent } from 'react-native';
import type { KeyPress } from '../lib/key-commands';

/**
 * A key the root view received, as the editor's key commands read it. On the Mac the view only gets the keys it lists
 * (HANDLED_KEYS), never keys typed into a field (TextField stops them), and ⌘ is the command key. The Windows build
 * has its own twin (key-event.web.ts).
 */
export function keyPressOf(event: KeyEvent): KeyPress | undefined {
  const { key, metaKey, shiftKey, altKey } = event.nativeEvent;
  return { key, metaKey, shiftKey, altKey };
}

/** The key was used: nothing else should act on it. react-native-macos already keeps the keys it delivers. */
export function claimKey(event: KeyEvent): void {
  void event;
}
