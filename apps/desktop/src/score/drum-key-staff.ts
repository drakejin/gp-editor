import { EMPTY_NOTE_EFFECT, QUARTER } from '@gp-editor/core';
import type { Palette } from '../theme';
import type { DrawCommand, LineCommand } from './draw';
import { type Chord, layoutChord, ledgerLines, noteheads } from './notation/chords';
import { drumTechniques } from './notation/drum-techniques';
import { type StaffNote, type VoiceEvent, placeDrum } from './notation/events';
import { NOTATION, STAFF } from './notation/metrics';
import { horizontal, vertical } from './notation/glyphs';
import { staffLines } from './notation/staff';

/**
 * The Drum Key's little staves: each drum's notehead where the score writes it, drawn by the score's own engraving
 * (`placeDrum`, `layoutChord`, `noteheads`, `ledgerLines`, `drumTechniques`), so the key cannot disagree with the score.
 */
export const DRUM_KEY_STAFF = {
  /** One drum's width (at least). */
  column: 72,
  /** The bracket over a column's drums: its ends' height and how far it stays from the column's edges. */
  bracketHook: 5,
  bracketInset: 6,
  /** Room for the symbols a drum carries above or below the staff (the cymbal edge's pictogram, a stroke). */
  markRoom: 2.5 * NOTATION.space,
} as const;

const SPACE = NOTATION.space;
/** Room beyond the outermost notehead (half a space for the notehead, half for air). */
const HEAD_ROOM = SPACE;

/** The staff's top line (y) and the canvas height for a set of drums: one size for a row of columns, so their staves line up. */
export interface DrumKeyStaffBox {
  readonly top: number;
  readonly height: number;
}

/** The key's colours on the dark chrome: drums, staff and ledger lines, the drum the mouse is over. */
export interface DrumKeyColors {
  readonly ink: string;
  readonly line: string;
  readonly lit: string;
}

/**
 * The drum the mouse is over: a blue apart from the white noteheads on either chrome (the chrome's light-blue accent
 * text is too close to them), at AA contrast on it (`__tests__/drum-key-staff.test.ts`).
 */
const LIT_DRUM = '#5AA9FF';

export function drumKeyColors(palette: Palette): DrumKeyColors {
  return { ink: palette.chromeText, line: palette.chromeMuted, lit: LIT_DRUM };
}

function staffNoteOf(key: number): StaffNote {
  return placeDrum({ string: 1, fret: key, velocity: 0, isTied: false, effect: EMPTY_NOTE_EFFECT });
}

/** A drum on the key's staff as a stemless quarter note: its articulations go above it, as over a stemless note. */
function chordOf(key: number, index: number, top: number, column: number): Chord {
  const event: VoiceEvent = {
    beatIndex: index,
    voiceIndex: 0,
    x: (index + 0.5) * column,
    start: 0,
    duration: QUARTER,
    direction: 'none',
    stroke: 'none',
    pickStroke: 'none',
    notes: [staffNoteOf(key)],
    ottava: 0,
  };
  return { ...layoutChord(event, index, 'down', top), hasStem: false };
}

/** The room the drums need above and below the staff, their symbols too. */
export function drumKeyStaffBox(keys: readonly number[]): DrumKeyStaffBox {
  const notes = keys.map(staffNoteOf);
  const positions = notes.map((note) => note.position);
  const highest = Math.max(STAFF.topLine, ...positions);
  const lowest = Math.min(STAFF.bottomLine, ...positions);
  const placements = notes.flatMap((note) => (note.drumTechnique === undefined ? [] : [note.drumTechnique.placement]));
  const hasMarkAbove = placements.some((placement) => placement === 'above' || placement === 'outside');
  const above = ((highest - STAFF.topLine) * SPACE) / 2 + HEAD_ROOM + (hasMarkAbove ? DRUM_KEY_STAFF.markRoom : 0);
  const below = ((STAFF.bottomLine - lowest) * SPACE) / 2 + HEAD_ROOM + (placements.includes('below') ? DRUM_KEY_STAFF.markRoom : 0);
  return { top: above, height: above + (STAFF.lineCount - 1) * SPACE + below };
}

export interface DrumKeyStaffOptions {
  /** The drums, one column each, left to right. */
  readonly keys: readonly number[];
  readonly box: DrumKeyStaffBox;
  readonly colors: DrumKeyColors;
  /** The drum the mouse is over: drawn in `colors.lit`. */
  readonly litKey?: number;
  /** One drum's width; `DRUM_KEY_STAFF.column` when absent. */
  readonly column?: number;
}

/** A staff `keys.length` columns wide with each drum's notehead, ledger lines and technique symbol in its column. */
export function engraveDrumKeyStaff({ keys, box, colors, litKey, column = DRUM_KEY_STAFF.column }: DrumKeyStaffOptions): DrawCommand[] {
  const width = keys.length * column;
  const chords = keys.map((key, index) => chordOf(key, index, box.top, column));
  const colorOf = (key: number | undefined) => (key !== undefined && key === litKey ? colors.lit : colors.ink);
  return [
    ...staffLines(0, width, box.top, colors.line),
    ...chords.flatMap((chord, index) => {
      const color = colorOf(keys[index]);
      return [
        ...ledgerLines(chord, box.top, colors.line),
        ...noteheads(chord, () => color),
        ...drumTechniques({ chords: [chord], tips: [undefined], isMultiVoice: false, top: box.top, color }),
      ];
    }),
  ];
}

/** The bracket over a column's drums, under its name (the reference legend's ⎴), `width` wide, hooks down from y = 0. */
export function drumKeyBracket(width: number, color: string): LineCommand[] {
  const { bracketHook: hook, bracketInset: inset } = DRUM_KEY_STAFF;
  const top = STAFF.lineWidth / 2;
  return [horizontal(inset, width - inset, top, STAFF.lineWidth, color), vertical(inset, top, hook, STAFF.lineWidth, color), vertical(width - inset, top, hook, STAFF.lineWidth, color)];
}
