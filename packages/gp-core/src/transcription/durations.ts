import { lookupName } from '../formats/gpif/xml';
import { NORMAL_TUPLET } from '../model/defaults';
import type { Duration, NoteValue, TimeSignature, Tuplet } from '../model/song';
import { MAX_TRANSCRIBED_NUMERATOR, TRANSCRIBED_DENOMINATORS, type TranscribedBeat, type TranscribedDuration } from './types';

/** The note value of each duration name the transcription contract uses. */
const NOTE_VALUE_BY_DURATION: Readonly<Record<TranscribedDuration, NoteValue>> = {
  whole: 1,
  half: 2,
  quarter: 4,
  eighth: 8,
  '16th': 16,
  '32nd': 32,
  '64th': 64,
};

export const TRANSCRIBED_DURATIONS = Object.keys(NOTE_VALUE_BY_DURATION) as readonly TranscribedDuration[];

/**
 * "n notes in the time of …" for each tuplet size: the usual ones (3:2, 5:4 … 12:8, those Guitar Pro stores), and the
 * duplet, quadruplet and octuplet of compound time (2:3, 4:3, 8:6), which are saved as dotted notes of the same length.
 */
const TUPLET_TIMES: ReadonlyMap<number, number> = new Map([
  [2, 3],
  [3, 2],
  [4, 3],
  [5, 4],
  [6, 4],
  [7, 4],
  [8, 6],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
]);


export function isTranscribedDuration(name: unknown): name is TranscribedDuration {
  return typeof name === 'string' && lookupName(NOTE_VALUE_BY_DURATION, name) !== undefined;
}

/** True for a tuplet size (notes in the tuplet) the import knows how to play. */
/** The largest tuplet the import plays (12 notes in the time of 8). */
export const MAX_TUPLET_SIZE = Math.max(...TUPLET_TIMES.keys());

export function isTupletSize(size: number): boolean {
  return TUPLET_TIMES.has(size);
}

/** The tuplet of `size` notes; a plain duration for none (0, absent) or a size the import does not know. */
export function toTuplet(size: number | undefined): Tuplet {
  const times = size === undefined ? undefined : TUPLET_TIMES.get(size);
  return size === undefined || times === undefined ? NORMAL_TUPLET : { enters: size, times };
}

/** A transcribed beat's duration: its note value, dots (1 or 2) and tuplet. */
export function toDuration(beat: TranscribedBeat): Duration {
  const dots = beat.dots ?? 0;
  return {
    value: NOTE_VALUE_BY_DURATION[beat.duration],
    dotted: dots === 1,
    doubleDotted: dots >= 2,
    tuplet: toTuplet(beat.tuplet),
  };
}

export function isTimeSignature(value: TimeSignature): boolean {
  const { numerator, denominator } = value;
  return Number.isInteger(numerator) && numerator >= 1 && numerator <= MAX_TRANSCRIBED_NUMERATOR && TRANSCRIBED_DENOMINATORS.includes(denominator);
}
