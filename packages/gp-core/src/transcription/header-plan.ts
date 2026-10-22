import { measureTicks } from '../model/defaults';
import { type MeasureHeader, QUARTER_TIME, type TimeSignature } from '../model/song';
import { isTimeSignature } from './durations';
import type { TranscribedMeasure } from './types';

/** Tempo when neither the song nor the first bar marks one. */
export const DEFAULT_TEMPO = 120;
const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };
/** Endings a measure header holds (bits 0…7 of repeatAlternative). */
const MAX_ALTERNATE_ENDING = 8;

/** A transcribed measure with the header it got and the key signature every track's measure there has. */
export interface PlannedMeasure {
  readonly source: TranscribedMeasure;
  readonly header: MeasureHeader;
  readonly headerIndex: number;
  readonly keySignature: number;
}

/** The measure headers, and each transcribed measure with its header. */
export interface HeaderPlan {
  readonly measureHeaders: readonly MeasureHeader[];
  readonly measures: readonly PlannedMeasure[];
}

/** What carries from one measure to the next until a measure marks a change. */
interface Carried {
  readonly timeSignature: TimeSignature;
  readonly tempo: number;
  readonly keySignature: number;
  readonly start: number;
}

/** The contract counts how many times a section plays in all, the model how many times it repeats; a printed repeat close repeats at least once. */
function toRepeatClose(plays: number | undefined): number {
  return plays === undefined || plays <= 0 ? 0 : Math.max(1, plays - 1);
}

/** Ending n is bit n − 1. */
function toRepeatAlternative(ending: number | undefined): number {
  return ending === undefined || ending < 1 || ending > MAX_ALTERNATE_ENDING ? 0 : 1 << (ending - 1);
}

function nextCarried(measure: TranscribedMeasure, carried: Carried): Carried {
  const marked = measure.timeSignature;
  const timeSignature = marked !== undefined && isTimeSignature(marked) ? { numerator: marked.numerator, denominator: marked.denominator } : carried.timeSignature;
  const tempo = measure.tempo !== undefined && measure.tempo > 0 ? measure.tempo : carried.tempo;
  return { timeSignature, tempo, keySignature: measure.keySignature ?? carried.keySignature, start: carried.start };
}

/**
 * Measure headers for all measures in order, from one quarter (QUARTER_TIME), each starting where the one before
 * ends. Time signature (4/4), tempo (`tempo`) and key (C) hold until a measure marks a change; repeat signs and endings
 * become the header's repeat count and ending bits.
 */
export function buildMeasureHeaders(measures: readonly TranscribedMeasure[], tempo: number): HeaderPlan {
  let carried: Carried = { timeSignature: FOUR_FOUR, tempo, keySignature: 0, start: QUARTER_TIME };
  const planned = measures.map((source, headerIndex): PlannedMeasure => {
    const current = nextCarried(source, carried);
    carried = { ...current, start: current.start + measureTicks(current.timeSignature.numerator, current.timeSignature.denominator) };
    const header: MeasureHeader = {
      number: headerIndex + 1,
      start: current.start,
      timeSignature: current.timeSignature,
      tempo: current.tempo,
      repeatOpen: source.repeatOpen === true,
      repeatClose: toRepeatClose(source.repeatClose),
      repeatAlternative: toRepeatAlternative(source.alternateEnding),
      tripletFeel: 'none',
    };
    return { source, header, headerIndex, keySignature: current.keySignature };
  });
  return { measureHeaders: planned.map((measure) => measure.header), measures: planned };
}
