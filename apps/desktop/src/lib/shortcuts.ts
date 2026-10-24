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
      { keys: 'C', action: 'Bend (choking)… (shape, amount, your own curve)', press: key('c') },
      { keys: 'W.bar', action: 'Tremolo bar… (palette button; Guitar Pro has no key for it)' },
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
      { keys: 'K', action: 'Chord diagram… (grid, name, chord library)', press: key('k') },
      { keys: 'Y', action: 'While the audio track plays: the cursor’s bar starts now (a sync point)', press: key('y') },
      { keys: '⌥[ / ⌥]', action: 'Longer / shorter note value', press: key('[', { altKey: true }) },
      { keys: '.', action: 'Dotted', press: key('.') },
      { keys: '/', action: 'Triplet', press: key('/') },
      { keys: '⌥/', action: 'Triplet inside the beat’s tuplet (nested tuplet)', press: key('/', { altKey: true }) },
    ],
  },
  {
    title: 'Moving around',
    shortcuts: [
      { keys: '← / →', action: 'Previous / next beat', press: key('ArrowLeft') },
      { keys: '↑ / ↓', action: 'String above / below', press: key('ArrowDown') },
      { keys: '⌥← / ⌥→', action: 'Previous / next bar', press: key('ArrowRight', { altKey: true }) },
      { keys: '⇧← / ⇧→', action: 'Select beats (for ⌘C / ⌘X)', press: key('ArrowRight', { shiftKey: true }) },
      { keys: '⌘1 – ⌘4', action: 'Edit voice 1, 2, 3 or 4 (the palette’s Voice buttons)', press: key('1', { metaKey: true }) },
      { keys: '⌥1 – ⌥4', action: 'Move the note (or the selected beats) to voice 1, 2, 3 or 4', press: key('2', { altKey: true }) },
      { keys: 'Home / End', action: 'First / last bar', press: key('Home') },
      { keys: '⌘- / ⌘=', action: 'Zoom out / in', press: key('=', { metaKey: true }) },
    ],
  },
  {
    title: 'Practice',
    shortcuts: [
      { keys: '⌥- / ⌥=', action: 'Playback speed −5% / +5% (25%–200%)', press: key('=', { altKey: true }) },
      { keys: '⌥M', action: 'Metronome on / off', press: key('m', { altKey: true }) },
      { keys: '⌥C', action: 'Count-in on / off (a bar of clicks before playback)', press: key('c', { altKey: true }) },
      { keys: '⌥L', action: 'Tempo lock: the whole song at one tempo', press: key('l', { altKey: true }) },
      { keys: '⇧⌘F', action: 'View ▸ Focus / Unfocus: only the score and the transport' },
    ],
  },
  {
    title: 'Everywhere',
    shortcuts: [
      { keys: 'Space', action: 'Play / stop', press: key(' ') },
      { keys: 'Esc', action: 'Close a panel or menu; otherwise stop', press: key('Escape') },
      { keys: '] / [', action: 'Playback tempo +5 / −5 BPM', press: key(']') },
      { keys: '⌘Z / ⇧⌘Z', action: 'Undo / redo', press: key('z', { metaKey: true }) },
      { keys: '⌘C', action: 'Copy the selected beats (or the cursor’s beat)', press: key('c', { metaKey: true }) },
      { keys: '⌘X', action: 'Cut the beats (rests too)', press: key('x', { metaKey: true }) },
      { keys: '⌘V', action: 'Paste at the cursor, across bar lines', press: key('v', { metaKey: true }) },
      { keys: '⌘S / ⇧⌘S', action: 'Save / save as' },
      { keys: '⌘P', action: 'Print' },
      { keys: '⇧⌘E', action: 'Export PDF' },
      { keys: '⌘N / ⌘O / ⇧⌘I', action: 'New / open / import a PDF (each in a new tab)' },
      { keys: '⌘W', action: 'Close the tab (asks to save an edited one)' },
      { keys: '⌃⇥ / ⌃⇧⇥', action: 'Next / previous tab' },
      { keys: '⌥⌘N / ⌥⌘R', action: 'Track ▸ Add Track… / Delete Track (the tracks panel’s + Track and −)' },
      { keys: '⇧⌘P', action: 'Command palette: find and run any command (Tools ▸ Transpose… too)' },
      { keys: '⌥⌘E', action: 'Expression Text: type a chord, dynamic, key, octave sign, clef or direction (or “>” in the palette)' },
      { keys: '⌘H', action: 'This sheet' },
    ],
  },
];
