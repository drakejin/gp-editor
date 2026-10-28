// Guitar Pro 3–5's codes (TuxGuitar GTPInputStream / GP5OutputStream, LGPL-2.1): what the gtp readers read and the
// GP3–GP5 writers write for tuplets, stroke speeds, trill periods, tremolo picking speeds and grace transitions.
import type { GraceTransition, NoteValue, Tuplet } from '../../model/song';

/** The tuplets GP3–GP5 store, named by their "enters" number (TuxGuitar's TGDivisionType.DIVISION_TYPES but 1:1). */
export const GTP_TUPLETS: readonly Tuplet[] = [
  { enters: 3, times: 2 },
  { enters: 5, times: 4 },
  { enters: 6, times: 4 },
  { enters: 7, times: 4 },
  { enters: 9, times: 8 },
  { enters: 10, times: 8 },
  { enters: 11, times: 8 },
  { enters: 12, times: 8 },
  { enters: 13, times: 8 },
];
/** 13:8 is stored by GP5 only. */
export const GP5_ONLY_TUPLET = 13;

/** The tuplet a GP3–GP5 division names; undefined when the version stores none of that division. */
export function gtpTupletOf(division: number, allowThirteen: boolean): Tuplet | undefined {
  return division === GP5_ONLY_TUPLET && !allowThirteen ? undefined : GTP_TUPLETS.find((tuplet) => tuplet.enters === division);
}

/** A note value and the byte that stands for it. */
export type NoteValueCode = readonly [value: NoteValue, code: number];

/** Stroke speeds (TuxGuitar's toStrokeValue): any other byte reads as a 64th. */
export const STROKE_SPEED_CODES: readonly NoteValueCode[] = [
  [64, 2],
  [32, 3],
  [16, 4],
  [8, 5],
  [4, 6],
];
export const TRILL_PERIOD_CODES: readonly NoteValueCode[] = [
  [16, 1],
  [32, 2],
  [64, 3],
];
export const TREMOLO_PICKING_CODES: readonly NoteValueCode[] = [
  [8, 1],
  [16, 2],
  [32, 3],
];

/** The note value a byte stands for in `codes`; undefined for a byte the table does not have. */
export function noteValueOfCode(codes: readonly NoteValueCode[], code: number): NoteValue | undefined {
  return codes.find((entry) => entry[1] === code)?.[0];
}

/** Grace note transitions by their byte. */
export const GRACE_TRANSITIONS: readonly GraceTransition[] = ['none', 'slide', 'bend', 'hammer'];
