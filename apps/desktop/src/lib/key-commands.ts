// i18n-exempt-file: key names (react-native's KeyEvent.key values) and editor commands, nothing shown
import type { HandledKeyEvent } from 'react-native';
import type { DeleteCommand } from '../native/gp-files';
import type { BarJump } from '../state/app-command';
import type { EditorAction } from '../state/editor';
import type { SongEdit } from '../state/song-edits';
import { type DigitEntry, nextFretEntry } from './fret-input';
import type { ScoreZoom } from './score-zoom';

/**
 * A panel for the note at the cursor that takes more than a toggle: vibrato width, the bend's curve, the tremolo bar's
 * curve (the palette's W.bar: Guitar Pro has no key for it).
 */
export type NotePanel = 'vibrato' | 'bend' | 'tremoloBar';

/**
 * What a key press does: an editor action, a playback control (play, the playback tempo), a jump to another bar, a
 * zoom step, a note panel, or the clipboard.
 */
export type KeyCommand =
  | EditorAction
  | { readonly type: 'togglePlayback' }
  | { readonly type: 'stopPlayback' }
  | { readonly type: 'shiftPlaybackTempo'; readonly delta: number }
  /** ⌥- / ⌥=: the playback speed, in percent of the written tempo. */
  | { readonly type: 'shiftPlaybackSpeed'; readonly delta: number }
  /** ⌥M metronome, ⌥C count-in, ⌥L tempo lock. */
  | { readonly type: 'togglePractice'; readonly practice: PracticeToggle }
  | { readonly type: 'goToBar'; readonly jump: BarJump }
  | { readonly type: 'zoom'; readonly direction: 1 | -1 }
  /** ⌘0: back to 100 % (the zoom menu: a fit to the page). */
  | { readonly type: 'zoomTo'; readonly zoom: ScoreZoom }
  | { readonly type: 'openNotePanel'; readonly panel: NotePanel }
  /** K: the chord diagram panel for the beat at the cursor. */
  | { readonly type: 'openChordPanel' }
  /** Y: while the audio track plays, the cursor's bar starts at the moment heard now (a sync point). */
  | { readonly type: 'markSyncPoint' }
  | { readonly type: 'copy' }
  | { readonly type: 'cut' }
  | { readonly type: 'paste' };

/** ] and [ : the playback tempo, in BPM. */
const PLAYBACK_TEMPO_STEP = 5;
/** ⌥= and ⌥- : the playback speed, in percent (Guitar Pro's relative speed). */
const PLAYBACK_SPEED_STEP = 5;

/** Practice settings a key turns on and off. */
export type PracticeToggle = 'metronome' | 'countIn' | 'tempoLock';

/** ⌥ + a letter: the practice toggles (M and C alone are palm mute and the bend panel). */
const PRACTICE_KEYS: Readonly<Record<string, PracticeToggle>> = { m: 'metronome', c: 'countIn', l: 'tempoLock' };

export interface KeyPress {
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** The named keys the editor answers, as react-native-macos names them (KeyEvent.key). */
export const KEYS = {
  arrowUp: 'ArrowUp',
  arrowDown: 'ArrowDown',
  arrowLeft: 'ArrowLeft',
  arrowRight: 'ArrowRight',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  escape: 'Escape',
  enter: 'Enter',
} as const;

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
  { key: 'ArrowUp', metaKey: true },
  { key: 'ArrowDown', metaKey: true },
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: 'ArrowLeft', altKey: true },
  { key: 'ArrowRight', altKey: true },
  { key: 'ArrowLeft', shiftKey: true },
  { key: 'ArrowRight', shiftKey: true },
  { key: 'Home' },
  { key: 'End' },
  { key: '-' },
  { key: '=' },
  { key: '-', metaKey: true },
  { key: '=', metaKey: true },
  { key: '+', metaKey: true, shiftKey: true },
  { key: '0', metaKey: true },
  { key: '[', altKey: true },
  { key: ']', altKey: true },
  { key: '/', altKey: true },
  ...[...Object.keys(PRACTICE_KEYS), '-', '='].map((key) => ({ key, altKey: true })),
  ...['c', 'x', 'v', 'd'].map((key) => ({ key, metaKey: true })),
  ...['1', '2', '3', '4'].flatMap((key) => [{ key, metaKey: true }, { key, altKey: true }]),
  { key: ' ' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
  { key: 'Backspace', shiftKey: true },
  ...['[', ']', '.', '/', 'r', 's', 'h', 'p', 'm', 'x', 'b', 'c', 'g', 'a', 'n', 't', 'i', 'k', 'y', 'd'].map((key) => ({ key })),
];

/**
 * Letter and punctuation keys for edits at the cursor. Hammer-on and pull-off are one Guitar Pro effect (the tab
 * shows H or P by the next note's direction), so H and P both toggle it.
 */
const EDIT_KEYS: Readonly<Record<string, SongEdit>> = {
  '.': { type: 'toggleDot' },
  '/': { type: 'toggleTriplet' },
  r: { type: 'toggleEffect', effect: 'letRing' },
  s: { type: 'toggleSlide' },
  h: { type: 'toggleEffect', effect: 'hammer' },
  p: { type: 'toggleEffect', effect: 'hammer' },
  m: { type: 'toggleEffect', effect: 'palmMute' },
  x: { type: 'toggleEffect', effect: 'deadNote' },
  g: { type: 'toggleEffect', effect: 'ghostNote' },
  a: { type: 'toggleEffect', effect: 'accentuatedNote' },
  n: { type: 'toggleHarmonic' },
  t: { type: 'toggleTie' },
  i: { type: 'insertBeat' },
  d: { type: 'deleteNotes' },
  Backspace: { type: 'erase' },
  Delete: { type: 'erase' },
};

const PANEL_KEYS: Readonly<Record<string, NotePanel>> = { b: 'vibrato', c: 'bend' };
/** Guitar Pro's chord diagram key is A, taken here by the accent. */
const CHORD_PANEL_KEY = 'k';
const SYNC_POINT_KEY = 'y';

const CLIPBOARD_KEYS: Readonly<Record<string, KeyCommand>> = { c: { type: 'copy' }, x: { type: 'cut' }, v: { type: 'paste' } };

/**
 * D and ⌘D, and Edit ▸ Delete Notes / Delete Bars: the note at the cursor or the selected notes (the beats stay as
 * rests); the cursor's bar or the selected bars (the palette's − Bar).
 */
export const DELETE_COMMANDS: Readonly<Record<DeleteCommand, KeyCommand>> = {
  notes: { type: 'edit', edit: { type: 'deleteNotes' } },
  bars: { type: 'edit', edit: { type: 'deleteMeasure' } },
};
/** ⌘1–⌘4: the cursor on voice 1–4 (Guitar Pro 8's Edit Voice keys). */
const VOICE_KEYS: Readonly<Record<string, KeyCommand>> = Object.fromEntries(
  ['1', '2', '3', '4'].map((key, voiceIndex): [string, KeyCommand] => [key, { type: 'selectVoice', voiceIndex }]),
);
/** ⌥1–⌥4: the note (or the selected beats) to voice 1–4 (Guitar Pro 8's Move Voice keys). */
const MOVE_VOICE_KEYS: Readonly<Record<string, KeyCommand>> = Object.fromEntries(
  ['1', '2', '3', '4'].map((key, voiceIndex): [string, KeyCommand] => [key, { type: 'edit', edit: { type: 'moveToVoice', voiceIndex } }]),
);

const SIMPLE_KEYS: Readonly<Record<string, KeyCommand>> = {
  ']': { type: 'shiftPlaybackTempo', delta: PLAYBACK_TEMPO_STEP },
  '[': { type: 'shiftPlaybackTempo', delta: -PLAYBACK_TEMPO_STEP },
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

/** ⌥M ⌥C ⌥L toggle the metronome, count-in and tempo lock; ⌥- ⌥= step the playback speed. */
function practiceKey(key: string): KeyCommand | undefined {
  if (key === '-' || key === '=') {
    return { type: 'shiftPlaybackSpeed', delta: key === '=' ? PLAYBACK_SPEED_STEP : -PLAYBACK_SPEED_STEP };
  }
  const practice = Object.prototype.hasOwnProperty.call(PRACTICE_KEYS, key.toLowerCase()) ? PRACTICE_KEYS[key.toLowerCase()] : undefined;
  return practice === undefined ? undefined : { type: 'togglePractice', practice };
}

const isUpDown = (key: string): boolean => key === 'ArrowUp' || key === 'ArrowDown';
const isLeftRight = (key: string): boolean => key === 'ArrowLeft' || key === 'ArrowRight';

/** ⌘ presses: undo / redo, zoom, the track, the clipboard, the bars, the voice; nothing else answers ⌘. */
function metaKeyCommand(key: string, shiftKey: boolean): KeyCommand | undefined {
  if (key.toLowerCase() === 'z') {
    return shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (key.toLowerCase() === 'd' && !shiftKey) {
    return DELETE_COMMANDS.bars;
  }
  if (key === '=' || key === '+' || key === '-') {
    return { type: 'zoom', direction: key === '-' ? -1 : 1 };
  }
  if (key === '0') {
    return { type: 'zoomTo', zoom: 1 };
  }
  if (isUpDown(key)) {
    return { type: 'moveCursorTrack', step: key === 'ArrowUp' ? -1 : 1 };
  }
  return CLIPBOARD_KEYS[key.toLowerCase()] ?? VOICE_KEYS[key];
}

/** What only ⌥ makes of a key: the duration steps, the inner triplet, the practice toggles, Move Voice, bar jumps. */
function altKeyCommand(key: string): KeyCommand | undefined {
  if (key === '[' || key === ']') {
    return { type: 'edit', edit: { type: 'shiftNoteValue', step: key === '[' ? -1 : 1 } };
  }
  if (key === '/') {
    return { type: 'edit', edit: { type: 'toggleInnerTriplet' } };
  }
  const command = practiceKey(key) ?? MOVE_VOICE_KEYS[key];
  if (command !== undefined) {
    return command;
  }
  return isLeftRight(key) ? { type: 'goToBar', jump: key === 'ArrowLeft' ? 'previous' : 'next' } : undefined;
}

/** What only ⇧ makes of a key: beats selected, the beat deleted. */
function shiftKeyCommand(key: string): KeyCommand | undefined {
  if (isLeftRight(key)) {
    return { type: 'extendSelection', step: key === 'ArrowLeft' ? -1 : 1 };
  }
  return key === 'Backspace' ? { type: 'edit', edit: { type: 'deleteBeat' } } : undefined;
}

/** A letter or punctuation key (any modifier but ⌘): an edit at the cursor, a note panel, the chord panel, a sync point. */
function letterKeyCommand(key: string): KeyCommand | undefined {
  const edit = EDIT_KEYS[key.length === 1 ? key.toLowerCase() : key];
  if (edit !== undefined) {
    return { type: 'edit', edit };
  }
  const panel = PANEL_KEYS[key.toLowerCase()];
  if (panel !== undefined) {
    return { type: 'openNotePanel', panel };
  }
  if (key.toLowerCase() === CHORD_PANEL_KEY) {
    return { type: 'openChordPanel' };
  }
  return key.toLowerCase() === SYNC_POINT_KEY ? { type: 'markSyncPoint' } : undefined;
}

/**
 * The editor's keys: arrows move the cursor (↑/↓ between strings — on into the next shown track in the multitrack view —,
 * ←/→ between beats, ⌘↑/↓ to the previous / next track), ⌥↑/↓ move the note, digits type
 * a fret (two quick digits make 10–29), letters toggle effects (R ring, S slide, H/P hammer-on / pull-off, M palm
 * mute, X dead note, G ghost, A accent, N harmonic, T tie) or open a panel (B vibrato, C bend, K chord), ⌫ / ⌦ turn a note into
 * a rest and remove a rest, D deletes the note (or the selected notes: the beats stay as rests), ⇧⌫ deletes the beat,
 * ⌘D the bar (or the selected bars), ⌥[ ⌥] . / change the duration (⌥/ a triplet inside the beat's tuplet), I inserts a
 * beat, Space plays,
 * [ ] change the playback tempo (⌥- ⌥= the speed in percent; ⌥M metronome, ⌥C count-in, ⌥L tempo lock), ⌥←/→ Home End jump between bars, ⇧←/→ select beats, ⌘- ⌘= (⌘+) ⌘0 zoom, ⌘C ⌘X ⌘V copy,
 * cut and paste, ⌘1–⌘4 put the cursor on voice 1–4 and ⌥1–⌥4 move the note there.
 * `lastDigit` remembers the previous digit. Full list: src/lib/shortcuts.ts.
 */
export function keyCommand(press: KeyPress, lastDigit: { current: DigitEntry | undefined }, now: number): KeyCommand | undefined {
  const { key, altKey, shiftKey } = press;
  if (press.metaKey) {
    return metaKeyCommand(key, shiftKey);
  }
  const command = (altKey ? altKeyCommand(key) : undefined) ?? (shiftKey ? shiftKeyCommand(key) : undefined) ?? letterKeyCommand(key);
  if (command !== undefined) {
    return command;
  }
  if (altKey && isUpDown(key)) {
    return { type: 'shiftNoteString', delta: key === 'ArrowUp' ? -1 : 1 };
  }
  if (DIGITS.includes(key)) {
    const entry = nextFretEntry(lastDigit.current, Number(key), now);
    lastDigit.current = entry;
    return { type: 'setNoteFret', fret: entry.value };
  }
  return SIMPLE_KEYS[key];
}
