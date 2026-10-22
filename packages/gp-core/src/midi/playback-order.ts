// Port of TuxGuitar app.tuxguitar.player.base.MidiRepeatController (LGPL-2.1): the order measures are played in.
import { measureTicks } from '../model/defaults';
import { type MeasureHeader, QUARTER_TIME } from '../model/song';

export interface PlayedMeasure {
  /** Index into Song.measureHeaders. */
  readonly headerIndex: number;
  /** Ticks added to the measure's song ticks by the repeats played before it (TuxGuitar's "repeat move"). */
  readonly move: number;
  /** Which pass over the played measures this is (renderMidi's passTempoScales). Default 0. */
  readonly passIndex?: number;
  /** Multiplies the measure's tempo during playback (the pass's practice speed). Default 1. */
  readonly tempoScale?: number;
}

/** Quarter notes per minute a played measure sounds at: its header's tempo times its pass's tempo scale. */
export function playedTempo(header: MeasureHeader, measure: PlayedMeasure): number {
  return header.tempo * (measure.tempoScale ?? 1);
}

/**
 * Upper bound on played measures, so a file with an absurd repeat count cannot stall the caller. Real songs
 * stay far below it (a 1000-measure song played four times is 4000).
 */
const MAX_PLAYED_MEASURES = 65_536;
/** Alternate-ending bitmasks are tested with 32-bit shifts; passes past bit 30 never match an ending. */
const MAX_ENDING_BIT = 30;

interface RepeatState {
  readonly index: number;
  /** Index of the furthest measure played so far. */
  readonly lastIndex: number;
  readonly isRepeatOpen: boolean;
  readonly repeatStart: number;
  readonly repeatMove: number;
  readonly repeatStartIndex: number;
  readonly repeatNumber: number;
  readonly repeatAlternative: number;
}

interface Step {
  readonly state: RepeatState;
  readonly shouldPlay: boolean;
}

const INITIAL_STATE: RepeatState = {
  index: 0,
  lastIndex: -1,
  isRepeatOpen: true,
  repeatStart: QUARTER_TIME,
  repeatMove: 0,
  repeatStartIndex: 0,
  repeatNumber: 0,
  repeatAlternative: 0,
};

function headerLength(header: MeasureHeader): number {
  return measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
}

function hasEnding(alternative: number, repeatNumber: number): boolean {
  return repeatNumber <= MAX_ENDING_BIT && (alternative & (1 << repeatNumber)) !== 0;
}

function openRepeat(state: RepeatState, header: MeasureHeader): RepeatState {
  return { ...state, repeatStartIndex: state.index, repeatStart: header.start, isRepeatOpen: true };
}

/** A repeat-open bar line; the counters restart the first time the measure is reached. */
function enterRepeatOpen(state: RepeatState, header: MeasureHeader): Step {
  const opened = openRepeat(state, header);
  const isFirstVisit = state.index > state.lastIndex;
  return { state: isFirstVisit ? { ...opened, repeatNumber: 0, repeatAlternative: 0 } : opened, shouldPlay: true };
}

/** Inside an alternate ending a measure only plays on the passes its ending is for. */
function enterAlternative(state: RepeatState, header: MeasureHeader): Step {
  const alternative = state.repeatAlternative === 0 ? header.repeatAlternative : state.repeatAlternative;
  if (state.isRepeatOpen && alternative > 0 && !hasEnding(alternative, state.repeatNumber)) {
    const skipped = { ...state, repeatMove: state.repeatMove - headerLength(header) };
    return { state: { ...skipped, repeatAlternative: header.repeatClose > 0 ? 0 : alternative }, shouldPlay: false };
  }
  return { state: { ...state, repeatAlternative: alternative }, shouldPlay: true };
}

/** A played repeat close jumps back to the repeat start, or ends the repeat once its passes are played. */
function closeRepeat(state: RepeatState, header: MeasureHeader): RepeatState {
  if (!state.isRepeatOpen || header.repeatClose <= 0) {
    return state;
  }
  if (state.repeatNumber < header.repeatClose || state.repeatAlternative > 0) {
    const repeatEnd = header.start + headerLength(header);
    return {
      ...state,
      repeatMove: state.repeatMove + repeatEnd - state.repeatStart,
      index: state.repeatStartIndex - 1,
      repeatNumber: state.repeatNumber + 1,
      repeatAlternative: 0,
    };
  }
  return { ...state, repeatStart: 0, repeatNumber: 0, isRepeatOpen: false, repeatAlternative: 0 };
}

/** MidiRepeatController.process for one header; `startNumber` is the 1-based number of the first measure to play. */
function processHeader(state: RepeatState, header: MeasureHeader, startNumber: number): Step {
  // The first measure (and the first measure to play) always opens a repeat.
  const opened = header.number === startNumber || header.number === 1 ? openRepeat(state, header) : state;
  const entered = header.repeatOpen ? enterRepeatOpen(opened, header) : enterAlternative(opened, header);
  const played = entered.shouldPlay
    ? closeRepeat({ ...entered.state, lastIndex: Math.max(entered.state.lastIndex, entered.state.index) }, header)
    : entered.state;
  const next = { ...played, index: played.index + 1 };
  if (header.number < startNumber) {
    // Measures before the start are walked through but not played, and add no repeat move.
    return { state: { ...next, repeatMove: 0 }, shouldPlay: false };
  }
  return { state: next, shouldPlay: entered.shouldPlay };
}

/** The measures to play, in order, with repeats expanded; playback starts at `fromHeaderIndex`. */
export function buildPlaybackOrder(
  headers: readonly MeasureHeader[],
  fromHeaderIndex: number,
): readonly PlayedMeasure[] {
  const startNumber = fromHeaderIndex + 1;
  const played: PlayedMeasure[] = [];
  let state = INITIAL_STATE;
  let header = headers[state.index];
  while (header !== undefined && played.length < MAX_PLAYED_MEASURES) {
    const step = processHeader(state, header, startNumber);
    if (step.shouldPlay) {
      played.push({ headerIndex: state.index, move: state.repeatMove });
    }
    state = step.state;
    header = headers[state.index];
  }
  return played;
}
