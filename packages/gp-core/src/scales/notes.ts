// Port of TuxGuitar's ScaleManager (KEY_NAMES, selectScale) and TGScale (setKeyName, getNote) (LGPL-2.1).
import { SCALES } from './table';

export type Alteration = 'natural' | 'sharp' | 'flat';

/** A key a scale can start on, as TuxGuitar's scale dialog lists them: C, C#, Db … B. */
export interface ScaleRoot {
  readonly name: string;
  /** 0 = C … 11 = B. */
  readonly pitchClass: number;
  readonly alteration: Alteration;
}

/** A chosen scale: indexes into SCALE_ROOTS and SCALES (ScaleManager#selectScale's key and scale indexes). */
export interface ScaleChoice {
  readonly rootIndex: number;
  readonly scaleIndex: number;
}

/** ScaleManager's KEY_NAMES. */
const ROOT_NAMES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const;

const LETTER_PITCH_CLASSES: ReadonlyMap<string, number> = new Map([
  ['C', 0],
  ['D', 2],
  ['E', 4],
  ['F', 5],
  ['G', 7],
  ['A', 9],
  ['B', 11],
]);

/** TGScale#setKeyName: the letter's pitch class, a semitone higher for "#", lower for "b". */
function toScaleRoot(name: string): ScaleRoot {
  const letter = LETTER_PITCH_CLASSES.get(name.slice(0, 1)) ?? 0;
  const alteration: Alteration = name.includes('#') ? 'sharp' : name.includes('b') ? 'flat' : 'natural';
  const shift = alteration === 'sharp' ? 1 : alteration === 'flat' ? -1 : 0;
  return { name, pitchClass: (letter + shift + 12) % 12, alteration };
}

export const SCALE_ROOTS: readonly ScaleRoot[] = ROOT_NAMES.map(toScaleRoot);

export function toPitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

/** The scale's pitch classes from the root up; none for a choice outside the lists (TuxGuitar's "None"). */
export function scalePitchClasses(choice: ScaleChoice): readonly number[] {
  const root = SCALE_ROOTS[choice.rootIndex];
  const definition = SCALES[choice.scaleIndex];
  if (root === undefined || definition === undefined) {
    return [];
  }
  return definition.intervals.map((interval) => (root.pitchClass + interval) % 12);
}

/** TGScale#getNote: whether a MIDI pitch, in any octave, is a note of the scale. */
export function isScalePitch(choice: ScaleChoice, pitch: number): boolean {
  return scalePitchClasses(choice).includes(toPitchClass(pitch));
}

/** "A Pentatonic Minor Scale"; empty for a choice outside the lists. */
export function scaleTitle(choice: ScaleChoice): string {
  const root = SCALE_ROOTS[choice.rootIndex];
  const definition = SCALES[choice.scaleIndex];
  return root === undefined || definition === undefined ? '' : `${root.name} ${definition.name}`;
}

/** The index of the scale with exactly this name. */
export function scaleIndexNamed(name: string): number | undefined {
  const index = SCALES.findIndex((definition) => definition.name === name);
  return index < 0 ? undefined : index;
}

/** Indexes of the scales whose name holds every word of the query, in any case; every scale for a blank query. */
export function searchScales(query: string): readonly number[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  return SCALES.flatMap((definition, index) => {
    const name = definition.name.toLowerCase();
    return words.every((word) => name.includes(word)) ? [index] : [];
  });
}
