// How Guitar Pro files store a note's fingering (no TuxGuitar counterpart: GP3InputStream / GP5InputStream skip it).
import type { Finger } from '../../model/song';
import { lookupName } from '../gpif/xml';

/** The five fingers, thumb first: GP3–GP5 store a finger as its index here (-1 = none). */
export const FINGERS: readonly Finger[] = ['thumb', 'index', 'middle', 'annular', 'little'];

/** "No finger" in a GP3–GP5 fingering byte. */
const NO_GP_FINGER = -1;

/** GPIF's letters (`<LeftFingering>` / `<RightFingering>`): pulgar, índice, medio, anular, chico. */
const GPIF_LETTERS: Readonly<Record<Finger, string>> = { thumb: 'P', index: 'I', middle: 'M', annular: 'A', little: 'C' };
const FINGERS_BY_LETTER: Readonly<Record<string, Finger>> = Object.fromEntries(FINGERS.map((finger) => [GPIF_LETTERS[finger], finger]));

/** A GP3–GP5 fingering byte (0 thumb … 4 little); undefined for none or an unknown value. */
export function fingerFromGp(value: number): Finger | undefined {
  return Number.isInteger(value) ? FINGERS[value] : undefined;
}

/** The GP3–GP5 fingering byte of a finger; NO_GP_FINGER for none. */
export function gpFingerByte(finger: Finger | undefined): number {
  return finger === undefined ? NO_GP_FINGER : FINGERS.indexOf(finger);
}

/** A GPIF fingering letter; undefined for anything Guitar Pro does not write. */
export function fingerFromGpif(letter: string | undefined): Finger | undefined {
  return lookupName(FINGERS_BY_LETTER, letter?.trim());
}

export function gpifFingerLetter(finger: Finger): string {
  return GPIF_LETTERS[finger];
}
