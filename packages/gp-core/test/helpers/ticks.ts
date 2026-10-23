import { QUARTER_TIME } from '../../src/model/song';

/**
 * Song ticks of one tick of TuxGuitar's grid (960 per quarter note). Tests write positions as TuxGuitar counts them,
 * which stay whole numbers for every duration but the 7, 9, 11 and 13-tuplets, and convert with these.
 */
const TUX_TICK = QUARTER_TIME / 960;

/** Song ticks of a position written in TuxGuitar ticks. */
export function fromTux(tuxTicks: number): number {
  return tuxTicks * TUX_TICK;
}

/** A song position in TuxGuitar ticks. */
export function toTux(songTicks: number): number {
  return songTicks / TUX_TICK;
}
