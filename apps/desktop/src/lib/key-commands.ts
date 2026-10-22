import type { HandledKeyEvent } from 'react-native';
import type { BarJump } from '../state/app-command';
import type { EditorAction } from '../state/editor';
import type { SongEdit } from '../state/song-edits';
import { type DigitEntry, nextFretEntry } from './fret-input';

/** What a key press does: an editor action, a playback control, a jump to another bar, or a zoom step. */
export type KeyCommand =
  | EditorAction
  | { readonly type: 'togglePlayback' }
  | { readonly type: 'stopPlayback' }
  | { readonly type: 'goToBar'; readonly jump: BarJump }
  | { readonly type: 'zoom'; readonly direction: 1 | -1 };

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
  { key: 'ArrowLeft', altKey: true },
  { key: 'ArrowRight', altKey: true },
  { key: 'Home' },
  { key: 'End' },
  { key: '-' },
  { key: '=' },
  { key: '-', metaKey: true },
  { key: '=', metaKey: true },
  { key: ' ' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
  { key: 'Backspace', shiftKey: true },
  ...['[', ']', '.', '/', 'h', 'p', 'l', 'v', 'x', 'g', 'a', 's', 'b', 'n', 't', 'i'].map((key) => ({ key })),
];

/** Letter and punctuation keys for edits at the cursor. */
const EDIT_KEYS: Readonly<Record<string, SongEdit>> = {
  '[': { type: 'shiftNoteValue', step: -1 },
  ']': { type: 'shiftNoteValue', step: 1 },
  '.': { type: 'toggleDot' },
  '/': { type: 'toggleTriplet' },
  h: { type: 'toggleEffect', effect: 'hammer' },
  p: { type: 'toggleEffect', effect: 'palmMute' },
  l: { type: 'toggleEffect', effect: 'letRing' },
  v: { type: 'toggleEffect', effect: 'vibrato' },
  x: { type: 'toggleEffect', effect: 'deadNote' },
  g: { type: 'toggleEffect', effect: 'ghostNote' },
  a: { type: 'toggleEffect', effect: 'accentuatedNote' },
  s: { type: 'toggleSlide' },
  b: { type: 'cycleBend' },
  n: { type: 'toggleHarmonic' },
  t: { type: 'toggleTie' },
  i: { type: 'insertBeat' },
};

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
  Home: { type: 'goToBar', jump: 'first' },
  End: { type: 'goToBar', jump: 'last' },
};

/**
 * Guitar Pro style keys: arrows move the cursor (↑/↓ between strings, ←/→ between beats), ⌥↑/↓ move the note,
 * digits type a fret (two quick digits make 10–29), [ ] . / change the duration, letters toggle effects,
 * I inserts a beat, ⇧⌫ deletes it, Space plays, ⌥←/→ Home End jump between bars, ⌘- ⌘= zoom. `lastDigit` remembers
 * the previous digit.
 */
export function keyCommand(press: KeyPress, lastDigit: { current: DigitEntry | undefined }, now: number): KeyCommand | undefined {
  if (press.metaKey && press.key.toLowerCase() === 'z') {
    return press.shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (press.metaKey && (press.key === '=' || press.key === '-')) {
    return { type: 'zoom', direction: press.key === '=' ? 1 : -1 };
  }
  if (press.altKey && (press.key === 'ArrowLeft' || press.key === 'ArrowRight')) {
    return { type: 'goToBar', jump: press.key === 'ArrowLeft' ? 'previous' : 'next' };
  }
  if (press.shiftKey && press.key === 'Backspace') {
    return { type: 'edit', edit: { type: 'deleteBeat' } };
  }
  const edit = press.metaKey ? undefined : EDIT_KEYS[press.key.toLowerCase()];
  if (edit !== undefined) {
    return { type: 'edit', edit };
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
