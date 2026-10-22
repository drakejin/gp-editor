import type { Duration } from '@gp-editor/core';
import { flagCount } from '../../lib/beams';
import { type LineCommand, SMUFL, type TextCommand } from '../draw';
import type { StaffNote, VoiceEvent } from './events';
import { horizontal, musicGlyph } from './glyphs';
import { ACCIDENTAL, BEAM, DOT, GLYPH_WIDTH, LEDGER, STAFF, STEM, positionY } from './metrics';
import type { Accidental } from './pitch';

export type StemDirection = 'up' | 'down';

export interface NoteHead {
  readonly note: StaffNote;
  /** Left edge. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly glyph: string;
}

/** The noteheads of one voice event and its stem before beaming. */
export interface Chord {
  readonly eventIndex: number;
  readonly event: VoiceEvent;
  readonly direction: StemDirection;
  /** Lowest first. */
  readonly heads: readonly NoteHead[];
  readonly left: number;
  readonly right: number;
  readonly hasStem: boolean;
  readonly stemX: number;
  /** End of the stem at the noteheads. */
  readonly stemBase: number;
  /** Free end of the stem; beams may move it further out. */
  readonly stemTip: number;
}

const ACCIDENTAL_GLYPHS: Readonly<Record<Accidental, { readonly text: string; readonly width: number }>> = {
  flat: { text: SMUFL.accidentalFlat, width: GLYPH_WIDTH.accidentalFlat },
  natural: { text: SMUFL.accidentalNatural, width: GLYPH_WIDTH.accidentalNatural },
  sharp: { text: SMUFL.accidentalSharp, width: GLYPH_WIDTH.accidentalSharp },
};
const WHOLE = 1;
const HALF = 2;
/** The first ledger line above and below the staff. */
const LEDGER_ABOVE = STAFF.topLine + 2;
const LEDGER_BELOW = STAFF.bottomLine - 2;

export function dotCount(duration: Duration): number {
  return duration.dotted ? 1 : duration.doubleDotted ? 2 : 0;
}

function noteheadGlyph(note: StaffNote, value: number): { readonly glyph: string; readonly width: number } {
  if (note.isCross) {
    return { glyph: SMUFL.noteheadXBlack, width: GLYPH_WIDTH.noteheadX };
  }
  if (value === WHOLE) {
    return { glyph: SMUFL.noteheadWhole, width: GLYPH_WIDTH.noteheadWhole };
  }
  return { glyph: value === HALF ? SMUFL.noteheadHalf : SMUFL.noteheadBlack, width: GLYPH_WIDTH.noteheadBlack };
}

/**
 * Seconds in a chord: walking away from the stem's base, a note a step from an unmoved neighbour moves to the
 * other side of the stem (right for stems up, left for stems down).
 */
function secondShifts(positions: readonly number[], direction: StemDirection, offset: number): number[] {
  const order = positions.map((_, i) => (direction === 'up' ? i : positions.length - 1 - i));
  const moved = order.reduce<ReadonlySet<number>>((set, index, k) => {
    const previous = order[k - 1];
    const isSecond = previous !== undefined && Math.abs((positions[index] ?? 0) - (positions[previous] ?? 0)) === 1;
    return isSecond && !set.has(previous) ? new Set([...set, index]) : set;
  }, new Set());
  return positions.map((_, i) => (moved.has(i) ? (direction === 'up' ? offset : -offset) : 0));
}

export function layoutChord(event: VoiceEvent, eventIndex: number, direction: StemDirection, top: number): Chord {
  const value = event.duration.value;
  const hasStem = value !== WHOLE;
  const column = value === WHOLE ? GLYPH_WIDTH.noteheadWhole : GLYPH_WIDTH.noteheadBlack;
  const shifts = secondShifts(
    event.notes.map((note) => note.position),
    direction,
    hasStem ? column - STEM.width : column,
  );
  const heads = event.notes.map((note, i): NoteHead => {
    const { glyph, width } = noteheadGlyph(note, value);
    return { note, glyph, width, x: event.x - width / 2 + (shifts[i] ?? 0), y: positionY(top, note.position) };
  });
  const ys = heads.map((head) => head.y);
  const lowest = Math.max(...ys);
  const highest = Math.min(...ys);
  const middle = positionY(top, STAFF.middleLine);
  const extra = Math.max(0, flagCount(value) - 2) * BEAM.spacing;
  const stemOffset = GLYPH_WIDTH.noteheadBlack / 2 - STEM.width / 2;
  const isUp = direction === 'up';
  return {
    eventIndex,
    event,
    direction,
    heads,
    left: Math.min(...heads.map((head) => head.x)),
    right: Math.max(...heads.map((head) => head.x + head.width)),
    hasStem,
    stemX: isUp ? event.x + stemOffset : event.x - stemOffset,
    stemBase: isUp ? lowest - STEM.attach : highest + STEM.attach,
    // Stems of notes far from the staff reach the middle line.
    stemTip: isUp ? Math.min(highest - STEM.length - extra, middle) : Math.max(lowest + STEM.length + extra, middle),
  };
}

export function noteheads(chord: Chord, colorOf: (note: StaffNote) => string): TextCommand[] {
  return chord.heads.map((head) => musicGlyph(head.x, head.y, head.glyph, colorOf(head.note)));
}

/** Ledger lines from the staff out to the chord's outermost notes. */
export function ledgerLines(chord: Chord, top: number, color: string): LineCommand[] {
  const positions = chord.heads.map((head) => head.note.position);
  const lowest = Math.min(...positions);
  const highest = Math.max(...positions);
  const below = lowest <= LEDGER_BELOW ? Math.floor((STAFF.bottomLine - lowest) / 2) : 0;
  const above = highest >= LEDGER_ABOVE ? Math.floor((highest - STAFF.topLine) / 2) : 0;
  const ledgers = [
    ...Array.from({ length: below }, (_, i) => LEDGER_BELOW - 2 * i),
    ...Array.from({ length: above }, (_, i) => LEDGER_ABOVE + 2 * i),
  ];
  const x1 = chord.left - LEDGER.extension;
  const x2 = chord.right + LEDGER.extension;
  return ledgers.map((position) => horizontal(x1, x2, positionY(top, position), LEDGER.width, color));
}

/** Column of each accidental (0 = next to the notes): the first one where it clears the accidentals already there. */
function accidentalColumns(positions: readonly number[]): readonly number[] {
  const initial: { readonly columns: readonly (readonly number[])[]; readonly indexes: readonly number[] } = { columns: [], indexes: [] };
  return positions.reduce(({ columns, indexes }, position) => {
    const free = columns.findIndex((column) => column.every((other) => Math.abs(other - position) >= ACCIDENTAL.clearance));
    const index = free >= 0 ? free : columns.length;
    const column = [...(columns[index] ?? []), position];
    return { columns: [...columns.slice(0, index), column, ...columns.slice(index + 1)], indexes: [...indexes, index] };
  }, initial).indexes;
}

/** Accidentals left of the chord, placed from the top note down. */
export function accidentals(chord: Chord, color: string): TextCommand[] {
  const marked = chord.heads
    .flatMap((head) => (head.note.accidental === undefined ? [] : [{ head, accidental: head.note.accidental }]))
    .reverse();
  const columns = accidentalColumns(marked.map(({ head }) => head.note.position));
  return marked.map(({ head, accidental }, i) => {
    const glyph = ACCIDENTAL_GLYPHS[accidental];
    const right = chord.left - ACCIDENTAL.gap - (columns[i] ?? 0) * ACCIDENTAL.column;
    return musicGlyph(right - glyph.width, head.y, glyph.text, color);
  });
}

/** Augmentation dots right of the chord, in the space above notes on a line; `clearsFlag` moves them past a flag. */
export function dots(chord: Chord, top: number, color: string, clearsFlag: boolean): TextCommand[] {
  const count = dotCount(chord.event.duration);
  if (count === 0) {
    return [];
  }
  const positions = [...new Set(chord.heads.map(({ note }) => (note.position % 2 === 0 ? note.position + 1 : note.position)))];
  const start = Math.max(chord.right, clearsFlag ? chord.stemX + GLYPH_WIDTH.flag : chord.right) + DOT.gap;
  return Array.from({ length: count }, (_, k) =>
    positions.map((position) => musicGlyph(start + k * DOT.spacing, positionY(top, position), SMUFL.augmentationDot, color)),
  ).flat();
}
