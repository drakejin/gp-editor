// Practice playback (not in TuxGuitar): a bar range played as written, and the played measures repeated in passes.
import { measureTicks } from '../model/defaults';
import type { MeasureHeader } from '../model/song';
import type { PlayedMeasure } from './playback-order';

/**
 * fromHeaderIndex…toHeaderIndex once, in written order. Repeat signs and alternate endings inside the range are
 * not followed: a practice loop plays the bars as they are written, once per pass.
 */
export function buildRangeOrder(fromHeaderIndex: number, toHeaderIndex: number): readonly PlayedMeasure[] {
  return Array.from({ length: toHeaderIndex - fromHeaderIndex + 1 }, (_, offset) => ({
    headerIndex: fromHeaderIndex + offset,
    move: 0,
  }));
}

/** Ticks from the start of the first played measure to the end of the last one (0 when nothing is played). */
function passLength(headers: readonly MeasureHeader[], played: readonly PlayedMeasure[]): number {
  const first = played[0];
  const last = played[played.length - 1];
  const firstHeader = first === undefined ? undefined : headers[first.headerIndex];
  const lastHeader = last === undefined ? undefined : headers[last.headerIndex];
  if (first === undefined || last === undefined || firstHeader === undefined || lastHeader === undefined) {
    return 0;
  }
  const { numerator, denominator } = lastHeader.timeSignature;
  return lastHeader.start + last.move + measureTicks(numerator, denominator) - (firstHeader.start + first.move);
}

/**
 * The played measures once per entry of `passTempoScales`, each pass starting where the previous one ends (moved by
 * whole pass lengths) and playing at its own tempo scale.
 */
export function buildPasses(
  headers: readonly MeasureHeader[],
  played: readonly PlayedMeasure[],
  passTempoScales: readonly number[],
): readonly PlayedMeasure[] {
  const length = passLength(headers, played);
  return passTempoScales.flatMap((tempoScale, passIndex) =>
    played.map((measure) => ({ ...measure, move: measure.move + passIndex * length, passIndex, tempoScale })),
  );
}
