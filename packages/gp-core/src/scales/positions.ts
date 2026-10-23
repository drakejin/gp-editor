// A scale's places on a neck, after TuxGuitar's TGFretBoard#paintScale (LGPL-2.1); the five-fret boxes are not in TuxGuitar.
import { NECK_FRETS } from '../edit/edit-song';
import type { GuitarString } from '../model/song';
import { type ScaleChoice, SCALE_ROOTS, scalePitchClasses, toPitchClass } from './notes';

/** Necks a scale is laid out on: 3 to 10 strings. */
export const MIN_SCALE_STRINGS = 3;
export const MAX_SCALE_STRINGS = 10;
/** Frets a box spans, the fret before its first note included: a hand position with a stretch. */
export const SCALE_BOX_FRETS = 5;

/** A place on the neck where a note of the scale is: string 1 = highest, fret 0 = the open string. */
export interface ScalePosition {
  readonly string: number;
  readonly fret: number;
  /** The open string's pitch plus the fret. */
  readonly pitch: number;
  readonly isRoot: boolean;
}

/** The scale's notes between two frets (both included), e.g. a pentatonic box. */
export interface ScaleBox {
  readonly firstFret: number;
  readonly lastFret: number;
  readonly positions: readonly ScalePosition[];
}

function hasNeck(strings: readonly GuitarString[]): boolean {
  return strings.length >= MIN_SCALE_STRINGS && strings.length <= MAX_SCALE_STRINGS && strings.every((string) => Number.isInteger(string.tuning));
}

function lastFretOf(frets: number): number {
  return Number.isFinite(frets) ? Math.min(NECK_FRETS, Math.max(0, Math.round(frets))) : NECK_FRETS;
}

/**
 * Every place of the scale on the neck, string by string from string 1, frets 0 to `frets` (at most NECK_FRETS); none
 * for a neck of fewer than 3 or more than 10 strings, or no scale.
 */
export function scaleFretPositions(choice: ScaleChoice, strings: readonly GuitarString[], frets: number = NECK_FRETS): readonly ScalePosition[] {
  const pitchClasses = scalePitchClasses(choice);
  const root = SCALE_ROOTS[choice.rootIndex]?.pitchClass;
  if (pitchClasses.length === 0 || !hasNeck(strings)) {
    return [];
  }
  const last = lastFretOf(frets);
  const sorted = [...strings].sort((a, b) => a.number - b.number);
  return sorted.flatMap((string) =>
    Array.from({ length: last + 1 }, (_, fret): ScalePosition[] => {
      const pitch = string.tuning + fret;
      return pitchClasses.includes(toPitchClass(pitch)) ? [{ string: string.number, fret, pitch, isRoot: toPitchClass(pitch) === root }] : [];
    }).flat(),
  );
}

/** Where each box begins: one per scale note on the lowest string, from the root's first place up an octave. */
function boxStarts(choice: ScaleChoice, lowest: GuitarString, last: number): readonly number[] {
  const pitchClasses = scalePitchClasses(choice);
  const rootFret = toPitchClass((pitchClasses[0] ?? 0) - lowest.tuning);
  const starts = pitchClasses.map((pitchClass) => rootFret + toPitchClass(pitchClass - lowest.tuning - rootFret));
  return starts.map((start) => {
    const first = Math.max(0, start - 1);
    // A box that would run past the last fret is played an octave lower.
    return first + SCALE_BOX_FRETS - 1 > last && start >= 12 ? Math.max(0, start - 13) : first;
  });
}

/**
 * The scale cut into boxes of SCALE_BOX_FRETS frets, one per scale note on the lowest string, in scale order from
 * the root: each begins a fret before that note and holds every place of the scale in its frets, on every string.
 * Boxes that would begin on the same fret are given once. None where scaleFretPositions has none.
 */
export function scaleBoxes(choice: ScaleChoice, strings: readonly GuitarString[], frets: number = NECK_FRETS): readonly ScaleBox[] {
  const positions = scaleFretPositions(choice, strings, frets);
  const lowest = strings.reduce<GuitarString | undefined>((low, string) => (low === undefined || string.number > low.number ? string : low), undefined);
  if (positions.length === 0 || lowest === undefined) {
    return [];
  }
  const last = lastFretOf(frets);
  const firsts = [...new Set(boxStarts(choice, lowest, last))];
  return firsts.map((firstFret) => {
    const lastFret = Math.min(last, firstFret + SCALE_BOX_FRETS - 1);
    return { firstFret, lastFret, positions: positions.filter((position) => position.fret >= firstFret && position.fret <= lastFret) };
  });
}
