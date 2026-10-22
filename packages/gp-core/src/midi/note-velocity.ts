// Port of TuxGuitar MidiSequenceParser.getRealVelocity and TGVelocities (LGPL-2.1): how hard a note is struck.
import { MAX_VELOCITY, MIN_VELOCITY, VELOCITY_INCREMENT } from '../formats/common/velocity';
import { findPreviousNote, type PlacedNote, type TrackContext } from './note-search';

const HAMMER_SOFTENING = 25;

/** A velocity lowered by `amount`, not below MIN_VELOCITY. */
export function softer(velocity: number, amount: number): number {
  return Math.max(MIN_VELOCITY, velocity - amount);
}

function afterHammer(context: TrackContext, placed: PlacedNote, velocity: number): number {
  if (context.channel.isPercussion) {
    return velocity;
  }
  return findPreviousNote(context, placed)?.effect.hammer === true ? softer(velocity, HAMMER_SOFTENING) : velocity;
}

/** getRealVelocity: softer after a hammer-on, and for ghost notes; louder for accents. */
export function realVelocity(context: TrackContext, placed: PlacedNote): number {
  const velocity = afterHammer(context, placed, placed.note.velocity);
  const { effect } = placed.note;
  if (effect.ghostNote) {
    return Math.min(MAX_VELOCITY, softer(velocity, VELOCITY_INCREMENT));
  }
  if (effect.accentuatedNote) {
    return Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, velocity + VELOCITY_INCREMENT));
  }
  if (effect.heavyAccentuatedNote) {
    return Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, velocity + VELOCITY_INCREMENT * 2));
  }
  return Math.min(MAX_VELOCITY, velocity);
}
