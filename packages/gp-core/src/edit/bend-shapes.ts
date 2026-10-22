// Bend shapes after the presets of TuxGuitar's TGBendDialog (createPresetItems, LGPL-2.1), at any amount; TuxGuitar has
// no 'release' preset.
import { BEND_MAX_VALUE } from '../formats/common/bend-units';
import type { Bend } from '../model/song';

/** The bends an editor offers by name. */
export type BendShape = 'bend' | 'bendRelease' | 'bendReleaseBend' | 'preBend' | 'preBendRelease' | 'release';

/** A bend recognised as one of the shapes, `amount` quarter tones high. */
export interface ShapedBend {
  readonly shape: BendShape;
  readonly amount: number;
}

export const BEND_SHAPES: readonly BendShape[] = ['bend', 'bendRelease', 'bendReleaseBend', 'preBend', 'preBendRelease', 'release'];

/** Bend amounts in quarter tones: a quarter tone up to three tones (TGEffectBend.MAX_VALUE_LENGTH). */
export const MIN_BEND_AMOUNT = 1;
export const MAX_BEND_AMOUNT = BEND_MAX_VALUE;

/** Each shape's points: position 0…12, and whether the string is bent (1) or not (0) there. */
const SHAPE_POINTS: Readonly<Record<BendShape, readonly (readonly [position: number, isBent: 0 | 1])[]>> = {
  bend: [[0, 0], [6, 1], [12, 1]],
  bendRelease: [[0, 0], [3, 1], [6, 1], [9, 0], [12, 0]],
  bendReleaseBend: [[0, 0], [2, 1], [4, 1], [6, 0], [8, 0], [10, 1], [12, 1]],
  preBend: [[0, 1], [12, 1]],
  preBendRelease: [[0, 1], [4, 1], [8, 0], [12, 0]],
  // Bent from the start (held from before the note) and let down by its middle: the mirror of 'bend'.
  release: [[0, 1], [6, 0], [12, 0]],
};

/** The amount rounded into MIN_BEND_AMOUNT…MAX_BEND_AMOUNT; NaN gives the smallest. */
function toBendAmount(amount: number): number {
  if (Number.isNaN(amount)) {
    return MIN_BEND_AMOUNT;
  }
  return Math.min(MAX_BEND_AMOUNT, Math.max(MIN_BEND_AMOUNT, Math.round(amount)));
}

export function isSameCurve(a: Bend, b: Bend): boolean {
  return a.points.length === b.points.length && a.points.every((point, i) => point.position === b.points[i]?.position && point.value === b.points[i]?.value);
}

/** A bend of `shape`, `amount` quarter tones high (rounded and kept within 1…12: a quarter tone to three tones). */
export function buildBend(shape: BendShape, amount: number): Bend {
  const value = toBendAmount(amount);
  return { points: SHAPE_POINTS[shape].map(([position, isBent]) => ({ position, value: isBent * value })) };
}

/** The shape and amount of a bend buildBend makes; undefined for any other curve. */
export function bendShapeOf(bend: Bend): ShapedBend | undefined {
  const amount = Math.max(0, ...bend.points.map((point) => point.value));
  if (!Number.isInteger(amount) || amount < MIN_BEND_AMOUNT || amount > MAX_BEND_AMOUNT) {
    return undefined;
  }
  const shape = BEND_SHAPES.find((candidate) => isSameCurve(buildBend(candidate, amount), bend));
  return shape === undefined ? undefined : { shape, amount };
}
