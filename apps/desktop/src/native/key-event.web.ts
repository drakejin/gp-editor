import type { KeyEvent } from 'react-native';
import type { KeyPress } from '../lib/key-commands';

/** Fields that take typing: their keys are theirs (TextField's job on the Mac), except Esc, which closes the panel. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * A key the root view received (a DOM keyboard event in the Windows build). Ctrl plays the part of ⌘: Ctrl+Z undoes,
 * Ctrl+C copies, as the app's ⌘ shortcuts do on the Mac. Keys typed into a field are not the score's.
 */
export function keyPressOf(event: KeyEvent): KeyPress | undefined {
  const native = event.nativeEvent as unknown as KeyboardEvent;
  if (native.key !== 'Escape' && isTypingTarget(native.target)) {
    return undefined;
  }
  return { key: native.key, metaKey: native.ctrlKey || native.metaKey, shiftKey: native.shiftKey, altKey: native.altKey };
}

/** The key was used: the page must not act on it too (Space scrolling, Backspace, Alt+← going back …). */
export function claimKey(event: KeyEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
