// Port of TuxGuitar TGVelocities (LGPL-2.1): Guitar Pro dynamics to MIDI velocity, for the gtp and gpif readers.

/** TGVelocities.MIN_VELOCITY (ppp). */
export const MIN_VELOCITY = 15;
/** One dynamic step. */
export const VELOCITY_INCREMENT = 16;
export const MAX_VELOCITY = 127;
/** TGVelocities.DEFAULT (forte, 95). */
export const DEFAULT_VELOCITY = MIN_VELOCITY + VELOCITY_INCREMENT * 5;

/** GP dynamic (1 = ppp … 8 = fff) to MIDI velocity, kept in 0…127. */
export function velocityFromGp(value: number): number {
  const velocity = MIN_VELOCITY + VELOCITY_INCREMENT * value - VELOCITY_INCREMENT;
  return Math.min(MAX_VELOCITY, Math.max(0, velocity));
}

/** A velocity an edit sets: rounded and kept between ppp and fff (MIN_VELOCITY…MAX_VELOCITY). */
export function clampVelocity(velocity: number): number {
  return Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.round(velocity)));
}

export type DynamicName = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';

const DYNAMIC_NAMES: readonly DynamicName[] = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

/** The eight dynamics, ppp first, with their velocities (TGVelocities.PIANO_PIANISSIMO … FORTE_FORTISSIMO). */
export const DYNAMICS: readonly { readonly name: DynamicName; readonly velocity: number }[] = DYNAMIC_NAMES.map((name, index) => ({
  name,
  velocity: MIN_VELOCITY + VELOCITY_INCREMENT * index,
}));

/** The dynamic nearest to a velocity (the louder one half way between two, as GP5 saves it); forte for a non-number. */
export function dynamicOf(velocity: number): DynamicName {
  if (!Number.isFinite(velocity)) {
    return dynamicOf(DEFAULT_VELOCITY);
  }
  const index = Math.min(DYNAMICS.length - 1, Math.max(0, Math.round((velocity - MIN_VELOCITY) / VELOCITY_INCREMENT)));
  return DYNAMICS[index]?.name ?? 'f';
}
