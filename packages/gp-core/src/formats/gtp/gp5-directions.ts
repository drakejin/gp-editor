// GP5 musical directions (no TuxGuitar counterpart: GP5InputStream skips them; the layout is pyguitarpro's
// readDirections): 19 shorts after the channels, each the 1-based measure a direction is on, -1 when it is nowhere.
import type { ByteReader } from '../../io/byte-reader';
import type { MusicalDirection } from '../../model/song';
import { MUSICAL_DIRECTIONS, sortDirections } from '../common/directions';
import type { HeaderRead } from './shared';

/** The directions of each measure, by 1-based measure number. */
export type DirectionBars = ReadonlyMap<number, readonly MusicalDirection[]>;

/** The 19 direction shorts; numbers outside 1…measureCount are no direction (GP5 writes -1). */
export function readDirectionsGp5(reader: ByteReader): DirectionBars {
  const bars = new Map<number, MusicalDirection[]>();
  for (const direction of MUSICAL_DIRECTIONS) {
    const measureNumber = reader.readShort();
    if (measureNumber > 0) {
      bars.set(measureNumber, [...(bars.get(measureNumber) ?? []), direction]);
    }
  }
  return bars;
}

/** The header read with its directions, when it has any. */
export function withDirections(read: HeaderRead, bars: DirectionBars): HeaderRead {
  const directions = bars.get(read.header.number);
  return directions === undefined ? read : { ...read, header: { ...read.header, directions: sortDirections(directions) } };
}
