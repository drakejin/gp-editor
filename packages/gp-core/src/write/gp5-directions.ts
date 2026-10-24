// GP5 musical directions (no TuxGuitar counterpart: GP5OutputStream writes none): the inverse of readDirectionsGp5.
import { MUSICAL_DIRECTIONS } from '../formats/common/directions';
import type { MeasureHeader } from '../model/song';
import type { ByteWriter } from './byte-writer';

/** A direction GP5 places nowhere. */
const NO_MEASURE = -1;
/** The largest measure number a GP5 short holds. */
const MAX_MEASURE_NUMBER = 0x7fff;

/** The 1-based measure of each direction in GP5's order: the first bar that has it (GP5 places each once), else -1. */
function directionMeasureNumbers(headers: readonly MeasureHeader[]): readonly number[] {
  return MUSICAL_DIRECTIONS.map((direction) => {
    const header = headers.find((candidate) => candidate.directions?.includes(direction) === true);
    return header === undefined || header.number > MAX_MEASURE_NUMBER ? NO_MEASURE : header.number;
  });
}

/** The 19 direction shorts. */
export function writeDirectionsGp5(writer: ByteWriter, headers: readonly MeasureHeader[]): void {
  directionMeasureNumbers(headers).forEach((measureNumber) => writer.writeShort(measureNumber));
}
