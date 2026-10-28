import { type MessageKey, memoByLanguage, t } from './i18n/i18n';
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

/** A key the Mac keyboard names by a word (Space): shown in the shown language. */
interface KeyWord {
  readonly word: MessageKey;
}

/** A line of the sheet before it is put in the shown language: the keys, the action's catalogue key, the press. */
interface ShortcutRow {
  readonly keys: string | KeyWord;
  readonly action: MessageKey;
  readonly press?: KeyPress;
}

interface ShortcutGroupRows {
  readonly title: MessageKey;
  readonly rows: readonly ShortcutRow[];
}

const row = (keys: string | KeyWord, action: MessageKey, press?: KeyPress): ShortcutRow => ({ keys, action, ...(press === undefined ? {} : { press }) });

/** The note at the cursor: frets, effects, panels. */
const NOTE_ROWS: readonly ShortcutRow[] = [
  row('0 – 9', 'commands.shortcuts.fret', key('5')),
  row('R', 'commands.shortcuts.letRing', key('r')),
  row('S', 'commands.shortcuts.slide', key('s')),
  row('H', 'commands.shortcuts.hammerOn', key('h')),
  row('P', 'commands.shortcuts.pullOff', key('p')),
  row('M', 'commands.shortcuts.palmMute', key('m')),
  row('X', 'commands.shortcuts.deadNote', key('x')),
  row('B', 'commands.shortcuts.vibrato', key('b')),
  row('C', 'commands.shortcuts.bend', key('c')),
  row('W.bar', 'commands.shortcuts.tremoloBar'),
  row('G', 'commands.shortcuts.ghostNote', key('g')),
  row('A', 'commands.shortcuts.accent', key('a')),
  row('N', 'commands.shortcuts.naturalHarmonic', key('n')),
  row('T', 'commands.shortcuts.tie', key('t')),
  row('- / =', 'commands.shortcuts.fretDownUp', key('=')),
  row('⌥↑ / ⌥↓', 'commands.shortcuts.noteString', key(KEYS.arrowUp, { altKey: true })),
];

/** The cursor's beat: erase, delete (its notes, the selected ones, the bars), insert, its length. */
const BEAT_ROWS: readonly ShortcutRow[] = [
  row('⌫ / ⌦', 'commands.shortcuts.erase', key(KEYS.backspace)),
  row('⇧⌫', 'commands.shortcuts.deleteBeat', key(KEYS.backspace, { shiftKey: true })),
  row('D', 'commands.shortcuts.deleteNotes', key('d')),
  row('⌘D', 'commands.shortcuts.deleteBars', key('d', { metaKey: true })),
  row('I', 'commands.shortcuts.insertBeat', key('i')),
  row('K', 'commands.shortcuts.chord', key('k')),
  row('J', 'commands.shortcuts.annotation', key('j')),
  row('Y', 'commands.shortcuts.syncPoint', key('y')),
  row('⌥[ / ⌥]', 'commands.shortcuts.noteValue', key('[', { altKey: true })),
  row('.', 'commands.shortcuts.dotted', key('.')),
  row('/', 'commands.shortcuts.triplet', key('/')),
  row('⌥/', 'commands.shortcuts.innerTriplet', key('/', { altKey: true })),
];

/** Moving the cursor, selecting, voices, bars, zoom. */
const MOVING_ROWS: readonly ShortcutRow[] = [
  row('← / →', 'commands.shortcuts.beat', key(KEYS.arrowLeft)),
  row('↑ / ↓', 'commands.shortcuts.string', key(KEYS.arrowDown)),
  row('⌘↑ / ⌘↓', 'commands.shortcuts.track', key(KEYS.arrowDown, { metaKey: true })),
  row('⌥← / ⌥→', 'commands.shortcuts.bar', key(KEYS.arrowRight, { altKey: true })),
  row('⇧← / ⇧→', 'commands.shortcuts.select', key(KEYS.arrowRight, { shiftKey: true })),
  row('⌘1 – ⌘4', 'commands.shortcuts.editVoice', key('1', { metaKey: true })),
  row('⌥1 – ⌥4', 'commands.shortcuts.moveVoice', key('2', { altKey: true })),
  // i18n-exempt: key caps as the Mac keyboard prints them
  row('Home / End', 'commands.shortcuts.firstLastBar', key(KEYS.home)),
  row('⌘- / ⌘=', 'commands.shortcuts.zoom', key('=', { metaKey: true })),
  row('⌘0', 'commands.shortcuts.zoomActual', key('0', { metaKey: true })),
  row('F3', 'commands.shortcuts.multitrack'),
];

/** Practice playback. */
const PRACTICE_ROWS: readonly ShortcutRow[] = [
  row('⌥- / ⌥=', 'commands.shortcuts.speed', key('=', { altKey: true })),
  row('⌥M', 'commands.shortcuts.metronome', key('m', { altKey: true })),
  row('⌥C', 'commands.shortcuts.countIn', key('c', { altKey: true })),
  row('⌥L', 'commands.shortcuts.tempoLock', key('l', { altKey: true })),
  row('⇧⌘F', 'commands.shortcuts.focus'),
];

/** Anywhere in the window: playback, the clipboard, files and panels. */
const EVERYWHERE_ROWS: readonly ShortcutRow[] = [
  row({ word: 'commands.key.space' }, 'commands.shortcuts.play', key(' ')),
  // i18n-exempt: the key cap as the Mac keyboard prints it
  row('Esc', 'commands.shortcuts.escape', key(KEYS.escape)),
  row('] / [', 'commands.shortcuts.tempo', key(']')),
  row('⌘Z / ⇧⌘Z', 'commands.shortcuts.undo', key('z', { metaKey: true })),
  row('⌘C', 'commands.shortcuts.copy', key('c', { metaKey: true })),
  row('⌘X', 'commands.shortcuts.cut', key('x', { metaKey: true })),
  row('⌘V', 'commands.shortcuts.paste', key('v', { metaKey: true })),
  row('⌘S / ⇧⌘S', 'commands.shortcuts.save'),
  row('⌘P', 'commands.shortcuts.print'),
  row('⇧⌘E', 'commands.shortcuts.exportPdf'),
  row('F7', 'commands.shortcuts.stylesheet'),
  row('⌘N / ⌘O / ⇧⌘I', 'commands.shortcuts.newOpen'),
  row('⌘W', 'commands.shortcuts.closeTab'),
  row('⌃⇥ / ⌃⇧⇥', 'commands.shortcuts.cycleTab'),
  row('⌥⌘N / ⌥⌘R', 'commands.shortcuts.tracks'),
  row('⇧⌘P', 'commands.shortcuts.commandPalette'),
  row('⌥⌘E', 'commands.shortcuts.expressionText'),
  row('⌘H', 'commands.shortcuts.sheet'),
];

const GROUPS: readonly ShortcutGroupRows[] = [
  { title: 'commands.shortcuts.group.note', rows: NOTE_ROWS },
  { title: 'commands.shortcuts.group.beats', rows: BEAT_ROWS },
  { title: 'commands.shortcuts.group.moving', rows: MOVING_ROWS },
  { title: 'commands.shortcuts.group.practice', rows: PRACTICE_ROWS },
  { title: 'commands.shortcuts.group.everywhere', rows: EVERYWHERE_ROWS },
];

function toShortcut({ keys, action, press }: ShortcutRow): Shortcut {
  return { keys: typeof keys === 'string' ? keys : t(keys.word), action: t(action), ...(press === undefined ? {} : { press }) };
}

/**
 * The keyboard shortcut sheet (Help ▸ Keyboard Shortcuts, ⌘H): every key the app answers, by where it applies — in the
 * shown language (call it where the sheet is drawn).
 */
export const shortcutGroups = memoByLanguage((): readonly ShortcutGroup[] => GROUPS.map(({ title, rows }) => ({ title: t(title), shortcuts: rows.map(toShortcut) })));
