import type { HandledKeyEvent } from 'react-native';
import type { EditorAction } from '../state/editor';
import { type DigitEntry, nextFretEntry } from './fret-input';

/** What a key press does: an editor action, or a playback control. */
export type KeyCommand = EditorAction | { readonly type: 'togglePlayback' } | { readonly type: 'stopPlayback' };

export interface KeyPress {
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Keys the editor view claims (react-native-macos only delivers keys listed here). */
export const HANDLED_KEYS: HandledKeyEvent[] = [
  ...DIGITS.map((key) => ({ key })),
  { key: 'Backspace' },
  { key: 'Delete' },
  { key: 'ArrowUp' },
  { key: 'ArrowDown' },
  { key: 'ArrowUp', altKey: true },
  { key: 'ArrowDown', altKey: true },
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: '-' },
  { key: '=' },
  { key: ' ' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
];

const SIMPLE_KEYS: Readonly<Record<string, KeyCommand>> = {
  Backspace: { type: 'deleteNote' },
  Delete: { type: 'deleteNote' },
  ArrowUp: { type: 'moveCursorString', delta: -1 },
  ArrowDown: { type: 'moveCursorString', delta: 1 },
  ArrowLeft: { type: 'moveCursorBeat', step: -1 },
  ArrowRight: { type: 'moveCursorBeat', step: 1 },
  '-': { type: 'shiftNoteFret', delta: -1 },
  '=': { type: 'shiftNoteFret', delta: 1 },
  ' ': { type: 'togglePlayback' },
  Escape: { type: 'stopPlayback' },
};

/**
 * Guitar Pro style keys: arrows move the cursor (↑/↓ between strings, ←/→ between beats), ⌥↑/↓ move the note,
 * digits type a fret (two quick digits make 10–29), Space plays. `lastDigit` remembers the previous digit.
 */
export function keyCommand(press: KeyPress, lastDigit: { current: DigitEntry | undefined }, now: number): KeyCommand | undefined {
  if (press.metaKey && press.key.toLowerCase() === 'z') {
    return press.shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (press.altKey && (press.key === 'ArrowUp' || press.key === 'ArrowDown')) {
    return { type: 'shiftNoteString', delta: press.key === 'ArrowUp' ? -1 : 1 };
  }
  if (DIGITS.includes(press.key)) {
    const entry = nextFretEntry(lastDigit.current, Number(press.key), now);
    lastDigit.current = entry;
    return { type: 'setNoteFret', fret: entry.value };
  }
  return SIMPLE_KEYS[press.key];
}
