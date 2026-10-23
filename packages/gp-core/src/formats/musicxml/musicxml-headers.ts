// Measure headers from every MusicXML part (no TuxGuitar reader exists; mirrors MusicXMLWriter#writeDirection / #writeBarline).
import { RED, measureTicks } from '../../model/defaults';
import { type MeasureHeader, QUARTER_TIME, type TimeSignature } from '../../model/song';
import type { PartMeasure } from './musicxml-measures';

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };
const DEFAULT_TEMPO = 120;

/** The first part's value at a measure, in part order. */
function firstOf<T>(parts: readonly (readonly PartMeasure[])[], index: number, pick: (measure: PartMeasure) => T | undefined): T | undefined {
  for (const part of parts) {
    const measure = part[index];
    const value = measure === undefined ? undefined : pick(measure);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/** The last tempo marked after the measure's start: it holds from the next measure. */
function lastLater(measure: PartMeasure): number | undefined {
  const later = measure.tempos.filter((mark) => mark.tick > 0);
  return later[later.length - 1]?.value;
}

/** Each measure's ending bits from one part: an ending runs from its start through its stop or discontinue. */
function partEndings(measures: readonly PartMeasure[]): readonly number[] {
  let active = 0;
  return measures.map((measure) => {
    let bits = active;
    for (const ending of measure.endings) {
      const mask = ending.numbers.reduce((sum, number) => sum | (1 << (number - 1)), 0);
      if (ending.type === 'start') {
        active = mask;
        bits = mask;
      } else {
        bits |= mask;
        active = 0;
      }
    }
    return bits;
  });
}

/**
 * The song's measure headers, one per measure of the longest part: time signature and tempo hold until a part changes
 * them (a tempo marked after a measure's start takes effect at the next measure), repeats and endings of any part,
 * rehearsal marks as markers.
 */
export function buildMeasureHeaders(parts: readonly (readonly PartMeasure[])[]): readonly MeasureHeader[] {
  const count = Math.max(1, ...parts.map((part) => part.length));
  const endings = parts.map(partEndings);
  let timeSignature = FOUR_FOUR;
  let tempo = DEFAULT_TEMPO;
  let start = QUARTER_TIME;
  return Array.from({ length: count }, (_, index): MeasureHeader => {
    timeSignature = firstOf(parts, index, (measure) => measure.time) ?? timeSignature;
    const measureTempo = firstOf(parts, index, (measure) => measure.tempos.find((mark) => mark.tick === 0)?.value) ?? tempo;
    tempo = firstOf(parts, index, (measure) => lastLater(measure)) ?? measureTempo;
    const rehearsal = firstOf(parts, index, (measure) => measure.rehearsal);
    const repeatTimes = firstOf(parts, index, (measure) => measure.repeatTimes);
    const header: MeasureHeader = {
      number: index + 1,
      start,
      timeSignature,
      tempo: measureTempo,
      ...(rehearsal === undefined ? {} : { marker: { title: rehearsal, color: RED } }),
      repeatOpen: parts.some((part) => part[index]?.isRepeatOpen === true),
      repeatClose: repeatTimes === undefined ? 0 : Math.max(1, repeatTimes - 1),
      repeatAlternative: endings.reduce((bits, part) => bits | (part[index] ?? 0), 0),
      tripletFeel: 'none',
    };
    start += measureTicks(timeSignature.numerator, timeSignature.denominator);
    return header;
  });
}
