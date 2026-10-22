import type { KeyPress } from './key-commands';

/** One line of the shortcut sheet: the keys as shown, what they do, and (for score keys) the press it stands for. */
export interface Shortcut {
  readonly keys: string;
  readonly action: string;
  /** A press keyCommand must answer (checked by a test); menu shortcuts have none. */
  readonly press?: KeyPress;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly Shortcut[];
}

const key = (k: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key: k,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

/** The keyboard shortcut sheet (Help ▸ Keyboard Shortcuts, ⌘H): every key the app answers, by where it applies. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Note at the cursor',
    shortcuts: [
      { keys: '0 – 9', action: 'Fret (two quick digits: 10–29)', press: key('5') },
      { keys: 'R', action: 'Let ring', press: key('r') },
      { keys: 'S', action: 'Slide', press: key('s') },
      { keys: 'H', action: 'Hammer-on', press: key('h') },
      { keys: 'P', action: 'Pull-off', press: key('p') },
      { keys: 'M', action: 'Palm mute', press: key('m') },
      { keys: 'X', action: 'Dead (muted) note', press: key('x') },
      { keys: 'B', action: 'Vibrato… (width)', press: key('b') },
      { keys: 'C', action: 'Bend (choking)… (shape and amount)', press: key('c') },
      { keys: 'G', action: 'Ghost note', press: key('g') },
      { keys: 'A', action: 'Accent', press: key('a') },
      { keys: 'N', action: 'Natural harmonic', press: key('n') },
      { keys: 'T', action: 'Tie', press: key('t') },
      { keys: '- / =', action: 'Fret down / up', press: key('=') },
      { keys: '⌥↑ / ⌥↓', action: 'Move the note to the string above / below', press: key('ArrowUp', { altKey: true }) },
    ],
  },
  {
    title: 'Beats and rests',
    shortcuts: [
      { keys: '⌫ / ⌦', action: 'Note → rest; on a rest, remove it', press: key('Backspace') },
      { keys: '⇧⌫', action: 'Delete the beat', press: key('Backspace', { shiftKey: true }) },
      { keys: 'I', action: 'Insert a beat after the cursor', press: key('i') },
      { keys: '⌥[ / ⌥]', action: 'Longer / shorter note value', press: key('[', { altKey: true }) },
      { keys: '.', action: 'Dotted', press: key('.') },
      { keys: '/', action: 'Triplet', press: key('/') },
    ],
  },
  {
    title: 'Moving around',
    shortcuts: [
      { keys: '← / →', action: 'Previous / next beat', press: key('ArrowLeft') },
      { keys: '↑ / ↓', action: 'String above / below', press: key('ArrowDown') },
      { keys: '⌥← / ⌥→', action: 'Previous / next bar', press: key('ArrowRight', { altKey: true }) },
      { keys: 'Home / End', action: 'First / last bar', press: key('Home') },
      { keys: '⌘- / ⌘=', action: 'Zoom out / in', press: key('=', { metaKey: true }) },
    ],
  },
  {
    title: 'Everywhere',
    shortcuts: [
      { keys: 'Space', action: 'Play / stop', press: key(' ') },
      { keys: 'Esc', action: 'Stop', press: key('Escape') },
      { keys: '] / [', action: 'Playback tempo +5 / −5 BPM', press: key(']') },
      { keys: '⌘Z / ⇧⌘Z', action: 'Undo / redo', press: key('z', { metaKey: true }) },
      { keys: '⌘C', action: 'Copy the beats (clipboard)', press: key('c', { metaKey: true }) },
      { keys: '⌘X', action: 'Cut the beats (rests too)', press: key('x', { metaKey: true }) },
      { keys: '⌘V', action: 'Paste at the cursor, across bar lines', press: key('v', { metaKey: true }) },
      { keys: '⌘S / ⇧⌘S', action: 'Save / save as' },
      { keys: '⌘P', action: 'Print' },
      { keys: '⇧⌘E', action: 'Export PDF' },
      { keys: '⌘N / ⌘O / ⇧⌘I', action: 'New / open / import a PDF' },
      { keys: '⌘H', action: 'This sheet' },
    ],
  },
];
