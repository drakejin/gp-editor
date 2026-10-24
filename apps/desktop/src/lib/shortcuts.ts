import { memoByLanguage, t } from './i18n/i18n';
import { KEYS, type KeyPress } from './key-commands';

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

/**
 * The keyboard shortcut sheet (Help ▸ Keyboard Shortcuts, ⌘H): every key the app answers, by where it applies — in the
 * shown language (call it where the sheet is drawn).
 */
export const shortcutGroups = memoByLanguage((): readonly ShortcutGroup[] => [
  {
    title: t('commands.shortcuts.group.note'),
    shortcuts: [
      { keys: '0 – 9', action: t('commands.shortcuts.fret'), press: key('5') },
      { keys: 'R', action: t('commands.shortcuts.letRing'), press: key('r') },
      { keys: 'S', action: t('commands.shortcuts.slide'), press: key('s') },
      { keys: 'H', action: t('commands.shortcuts.hammerOn'), press: key('h') },
      { keys: 'P', action: t('commands.shortcuts.pullOff'), press: key('p') },
      { keys: 'M', action: t('commands.shortcuts.palmMute'), press: key('m') },
      { keys: 'X', action: t('commands.shortcuts.deadNote'), press: key('x') },
      { keys: 'B', action: t('commands.shortcuts.vibrato'), press: key('b') },
      { keys: 'C', action: t('commands.shortcuts.bend'), press: key('c') },
      { keys: 'W.bar', action: t('commands.shortcuts.tremoloBar') },
      { keys: 'G', action: t('commands.shortcuts.ghostNote'), press: key('g') },
      { keys: 'A', action: t('commands.shortcuts.accent'), press: key('a') },
      { keys: 'N', action: t('commands.shortcuts.naturalHarmonic'), press: key('n') },
      { keys: 'T', action: t('commands.shortcuts.tie'), press: key('t') },
      { keys: '- / =', action: t('commands.shortcuts.fretDownUp'), press: key('=') },
      { keys: '⌥↑ / ⌥↓', action: t('commands.shortcuts.noteString'), press: key(KEYS.arrowUp, { altKey: true }) },
    ],
  },
  {
    title: t('commands.shortcuts.group.beats'),
    shortcuts: [
      { keys: '⌫ / ⌦', action: t('commands.shortcuts.erase'), press: key(KEYS.backspace) },
      { keys: '⇧⌫', action: t('commands.shortcuts.deleteBeat'), press: key(KEYS.backspace, { shiftKey: true }) },
      { keys: 'I', action: t('commands.shortcuts.insertBeat'), press: key('i') },
      { keys: 'K', action: t('commands.shortcuts.chord'), press: key('k') },
      { keys: 'Y', action: t('commands.shortcuts.syncPoint'), press: key('y') },
      { keys: '⌥[ / ⌥]', action: t('commands.shortcuts.noteValue'), press: key('[', { altKey: true }) },
      { keys: '.', action: t('commands.shortcuts.dotted'), press: key('.') },
      { keys: '/', action: t('commands.shortcuts.triplet'), press: key('/') },
      { keys: '⌥/', action: t('commands.shortcuts.innerTriplet'), press: key('/', { altKey: true }) },
    ],
  },
  {
    title: t('commands.shortcuts.group.moving'),
    shortcuts: [
      { keys: '← / →', action: t('commands.shortcuts.beat'), press: key(KEYS.arrowLeft) },
      { keys: '↑ / ↓', action: t('commands.shortcuts.string'), press: key(KEYS.arrowDown) },
      { keys: '⌘↑ / ⌘↓', action: t('commands.shortcuts.track'), press: key(KEYS.arrowDown, { metaKey: true }) },
      { keys: '⌥← / ⌥→', action: t('commands.shortcuts.bar'), press: key(KEYS.arrowRight, { altKey: true }) },
      { keys: '⇧← / ⇧→', action: t('commands.shortcuts.select'), press: key(KEYS.arrowRight, { shiftKey: true }) },
      { keys: '⌘1 – ⌘4', action: t('commands.shortcuts.editVoice'), press: key('1', { metaKey: true }) },
      { keys: '⌥1 – ⌥4', action: t('commands.shortcuts.moveVoice'), press: key('2', { altKey: true }) },
      // i18n-exempt: key caps as the Mac keyboard prints them
      { keys: 'Home / End', action: t('commands.shortcuts.firstLastBar'), press: key(KEYS.home) },
      { keys: '⌘- / ⌘=', action: t('commands.shortcuts.zoom'), press: key('=', { metaKey: true }) },
      { keys: 'F3', action: t('commands.shortcuts.multitrack') },
    ],
  },
  {
    title: t('commands.shortcuts.group.practice'),
    shortcuts: [
      { keys: '⌥- / ⌥=', action: t('commands.shortcuts.speed'), press: key('=', { altKey: true }) },
      { keys: '⌥M', action: t('commands.shortcuts.metronome'), press: key('m', { altKey: true }) },
      { keys: '⌥C', action: t('commands.shortcuts.countIn'), press: key('c', { altKey: true }) },
      { keys: '⌥L', action: t('commands.shortcuts.tempoLock'), press: key('l', { altKey: true }) },
      { keys: '⇧⌘F', action: t('commands.shortcuts.focus') },
    ],
  },
  {
    title: t('commands.shortcuts.group.everywhere'),
    shortcuts: [
      { keys: t('commands.key.space'), action: t('commands.shortcuts.play'), press: key(' ') },
      // i18n-exempt: the key cap as the Mac keyboard prints it
      { keys: 'Esc', action: t('commands.shortcuts.escape'), press: key(KEYS.escape) },
      { keys: '] / [', action: t('commands.shortcuts.tempo'), press: key(']') },
      { keys: '⌘Z / ⇧⌘Z', action: t('commands.shortcuts.undo'), press: key('z', { metaKey: true }) },
      { keys: '⌘C', action: t('commands.shortcuts.copy'), press: key('c', { metaKey: true }) },
      { keys: '⌘X', action: t('commands.shortcuts.cut'), press: key('x', { metaKey: true }) },
      { keys: '⌘V', action: t('commands.shortcuts.paste'), press: key('v', { metaKey: true }) },
      { keys: '⌘S / ⇧⌘S', action: t('commands.shortcuts.save') },
      { keys: '⌘P', action: t('commands.shortcuts.print') },
      { keys: '⇧⌘E', action: t('commands.shortcuts.exportPdf') },
      { keys: 'F7', action: t('commands.shortcuts.stylesheet') },
      { keys: '⌘N / ⌘O / ⇧⌘I', action: t('commands.shortcuts.newOpen') },
      { keys: '⌘W', action: t('commands.shortcuts.closeTab') },
      { keys: '⌃⇥ / ⌃⇧⇥', action: t('commands.shortcuts.cycleTab') },
      { keys: '⌥⌘N / ⌥⌘R', action: t('commands.shortcuts.tracks') },
      { keys: '⇧⌘P', action: t('commands.shortcuts.commandPalette') },
      { keys: '⌥⌘E', action: t('commands.shortcuts.expressionText') },
      { keys: '⌘H', action: t('commands.shortcuts.sheet') },
    ],
  },
]);
