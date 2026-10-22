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
