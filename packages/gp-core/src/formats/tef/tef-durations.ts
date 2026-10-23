// Port of TuxGuitar app.tuxguitar.io.tef3.TESongParser.getDuration and getVelocityFromDynamic (LGPL-2.1).
import { NORMAL_TUPLET, plainDuration, toNoteValue } from '../../model/defaults';
import type { Duration } from '../../model/song';
import { DEFAULT_VELOCITY, DYNAMICS } from '../common/velocity';

const TRIPLET = { enters: 3, times: 2 } as const;
/** TENoteDuration: three codes per note value (plain, dotted, triplet) from the whole note (0) to the 64th (18). */
const CODES_PER_VALUE = 3;
const LAST_PLAIN_CODE = 18;
/** Codes 20, 23, 26, 29 are sixteenths and 21, 24, 27, 30 sixty-fourths; 31 is a dotted whole. */
const SIXTEENTH_FILLERS: ReadonlySet<number> = new Set([20, 23, 26, 29]);
const SIXTY_FOURTH_FILLERS: ReadonlySet<number> = new Set([21, 24, 27, 30]);
const DOTTED_WHOLE = 31;
/** Grid steps (sixty-fourths) in a whole note. */
const GRID_PER_WHOLE = 64;

/** A TENoteDuration code as a duration: 19, 22, 25 and 28 are the double-dotted half … sixteenth. */
export function durationFromTef(code: number): Duration {
  if (SIXTEENTH_FILLERS.has(code)) {
    return plainDuration(16);
  }
  if (SIXTY_FOURTH_FILLERS.has(code)) {
    return plainDuration(64);
  }
  if (code === DOTTED_WHOLE) {
    return { ...plainDuration(1), dotted: true };
  }
  const isDoubleDotted = code > LAST_PLAIN_CODE;
  const base = isDoubleDotted ? code - LAST_PLAIN_CODE : code;
  const kind = base % CODES_PER_VALUE;
  const value = toNoteValue(2 ** (Math.floor(base / CODES_PER_VALUE) + (kind === 1 ? 1 : 0)));
  return {
    value,
    dotted: kind === 1 && !isDoubleDotted,
    doubleDotted: isDoubleDotted,
    tuplet: kind === 2 ? TRIPLET : NORMAL_TUPLET,
  };
}

/** True for a triplet code (2 = whole … 17 = 32nd). */
export function isTripletCode(code: number): boolean {
  return code <= LAST_PLAIN_CODE && code % CODES_PER_VALUE === 2;
}

/**
 * The grid steps a triplet takes in TablEdit's layout: half its plain value (a triplet eighth takes a sixteenth's four
 * steps but lasts 16/3 of them). Not in TuxGuitar.
 */
export function tripletGridLength(code: number): number {
  return GRID_PER_WHOLE / durationFromTef(code).value / 2;
}

/** TEComponentNoteDynamics (0 = fff … 7 = ppp) as a MIDI velocity. */
export function velocityFromDynamic(dynamic: number): number {
  return DYNAMICS[DYNAMICS.length - 1 - dynamic]?.velocity ?? DEFAULT_VELOCITY;
}
