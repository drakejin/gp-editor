import type { HandledKeyEvent } from 'react-native';
import type { BarJump } from '../state/app-command';
import type { EditorAction } from '../state/editor';
import type { SongEdit } from '../state/song-edits';
import { type DigitEntry, nextFretEntry } from './fret-input';

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
  { key: 'ArrowLeft', shiftKey: true },
  { key: 'ArrowRight', shiftKey: true },
  { key: 'Home' },
  { key: 'End' },
  { key: '-' },
  { key: '=' },
  { key: '-', metaKey: true },
  { key: '=', metaKey: true },
  { key: '[', altKey: true },
  { key: ']', altKey: true },
  { key: '/', altKey: true },
  ...[...Object.keys(PRACTICE_KEYS), '-', '='].map((key) => ({ key, altKey: true })),
  ...['c', 'x', 'v'].map((key) => ({ key, metaKey: true })),
  { key: ' ' },
  { key: 'Escape' },
  { key: 'z', metaKey: true },
  { key: 'z', metaKey: true, shiftKey: true },
  { key: 'Backspace', shiftKey: true },
  ...['[', ']', '.', '/', 'r', 's', 'h', 'p', 'm', 'x', 'b', 'c', 'g', 'a', 'n', 't', 'i', 'k', 'y'].map((key) => ({ key })),
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
  Backspace: { type: 'erase' },
  Delete: { type: 'erase' },
};

const PANEL_KEYS: Readonly<Record<string, NotePanel>> = { b: 'vibrato', c: 'bend' };
/** Guitar Pro's chord diagram key is A, taken here by the accent. */
const CHORD_PANEL_KEY = 'k';
const SYNC_POINT_KEY = 'y';

const CLIPBOARD_KEYS: Readonly<Record<string, KeyCommand>> = { c: { type: 'copy' }, x: { type: 'cut' }, v: { type: 'paste' } };

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

/**
 * The editor's keys: arrows move the cursor (↑/↓ between strings, ←/→ between beats), ⌥↑/↓ move the note, digits type
 * a fret (two quick digits make 10–29), letters toggle effects (R ring, S slide, H/P hammer-on / pull-off, M palm
 * mute, X dead note, G ghost, A accent, N harmonic, T tie) or open a panel (B vibrato, C bend, K chord), ⌫ / ⌦ turn a note into
 * a rest and remove a rest, ⇧⌫ deletes the beat, ⌥[ ⌥] . / change the duration (⌥/ a triplet inside the beat's
 * tuplet), I inserts a beat, Space plays,
 * [ ] change the playback tempo (⌥- ⌥= the speed in percent; ⌥M metronome, ⌥C count-in, ⌥L tempo lock), ⌥←/→ Home End jump between bars, ⇧←/→ select beats, ⌘- ⌘= zoom, ⌘C ⌘X ⌘V copy,
 * cut and paste.
 * `lastDigit` remembers the previous digit. Full list: src/lib/shortcuts.ts.
 */
export function keyCommand(press: KeyPress, lastDigit: { current: DigitEntry | undefined }, now: number): KeyCommand | undefined {
  if (press.metaKey && press.key.toLowerCase() === 'z') {
    return press.shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (press.metaKey && (press.key === '=' || press.key === '-')) {
    return { type: 'zoom', direction: press.key === '=' ? 1 : -1 };
  }
  if (press.metaKey) {
    return CLIPBOARD_KEYS[press.key.toLowerCase()];
  }
  if (press.altKey && (press.key === '[' || press.key === ']')) {
    return { type: 'edit', edit: { type: 'shiftNoteValue', step: press.key === '[' ? -1 : 1 } };
  }
  if (press.altKey && press.key === '/') {
    return { type: 'edit', edit: { type: 'toggleInnerTriplet' } };
  }
  if (press.altKey) {
    const command = practiceKey(press.key);
    if (command !== undefined) {
      return command;
    }
  }
  if (press.altKey && (press.key === 'ArrowLeft' || press.key === 'ArrowRight')) {
    return { type: 'goToBar', jump: press.key === 'ArrowLeft' ? 'previous' : 'next' };
  }
  if (press.shiftKey && (press.key === 'ArrowLeft' || press.key === 'ArrowRight')) {
    return { type: 'extendSelection', step: press.key === 'ArrowLeft' ? -1 : 1 };
  }
  if (press.shiftKey && press.key === 'Backspace') {
    return { type: 'edit', edit: { type: 'deleteBeat' } };
  }
  const edit = EDIT_KEYS[press.key.length === 1 ? press.key.toLowerCase() : press.key];
  if (edit !== undefined) {
    return { type: 'edit', edit };
  }
  const panel = PANEL_KEYS[press.key.toLowerCase()];
  if (panel !== undefined) {
    return { type: 'openNotePanel', panel };
  }
  if (press.key.toLowerCase() === CHORD_PANEL_KEY) {
    return { type: 'openChordPanel' };
  }
  if (press.key.toLowerCase() === SYNC_POINT_KEY) {
    return { type: 'markSyncPoint' };
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
