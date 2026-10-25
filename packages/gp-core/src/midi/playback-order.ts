// Port of TuxGuitar app.tuxguitar.player.base.MidiRepeatController (LGPL-2.1): the order measures are played in.
import { headerTicks } from '../model/defaults';
import { type MeasureHeader, QUARTER_TIME } from '../model/song';
import { type DirectionState, INITIAL_DIRECTIONS, codaTarget, endsAtFine, skippedEndingEnd, takeJump } from './playback-directions';

export interface PlayedMeasure {
  /** Index into Song.measureHeaders. */
  readonly headerIndex: number;
  /** Ticks added to the measure's song ticks by the repeats played before it (TuxGuitar's "repeat move"). */
  readonly move: number;
  /** Which pass over the played measures this is (renderMidi's passTempoScales). Default 0. */
  readonly passIndex?: number;
  /** Multiplies the measure's tempo during playback (the pass's practice speed). Default 1. */
  readonly tempoScale?: number;
  /**
   * The tempos the measure plays at in place of its header's, from its start on (playback following the audio track,
   * midi/audio-sync.ts): the pass's tempo scale already applied. Absent: its header's tempo times `tempoScale`.
   */
  readonly tempos?: readonly TempoPiece[];
}

/** A tempo from `offset` ticks into a played measure on (the first piece at offset 0). */
export interface TempoPiece {
  readonly offset: number;
  /** Quarter notes per minute. */
  readonly tempo: number;
}

/** Quarter notes per minute a played measure starts at: its header's tempo times its pass's tempo scale. */
export function playedTempo(header: MeasureHeader, measure: PlayedMeasure): number {
  return measure.tempos?.[0]?.tempo ?? header.tempo * (measure.tempoScale ?? 1);
}

/** The tempos a played measure sounds at, from its start: one piece unless it follows the audio track. */
export function playedTempoPieces(header: MeasureHeader, measure: PlayedMeasure): readonly TempoPiece[] {
  return measure.tempos ?? [{ offset: 0, tempo: playedTempo(header, measure) }];
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
    const skipped = { ...state, repeatMove: state.repeatMove - headerTicks(header) };
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
    const repeatEnd = header.start + headerTicks(header);
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

/** Where playback is: the repeats' state and the directions' (normal, or after a jump). */
interface Walk {
  readonly repeat: RepeatState;
  readonly directions: DirectionState;
}

interface WalkStep {
  readonly walk: Walk;
  readonly played?: PlayedMeasure;
}

/** After a jump: the repeat state going on at `target` right where the measure played last ends (`end`), a repeat opened there. */
function goTo(repeat: RepeatState, headers: readonly MeasureHeader[], target: number, end: number): RepeatState {
  const start = headers[target]?.start ?? QUARTER_TIME;
  return { ...repeat, index: target, repeatMove: end - start, isRepeatOpen: true, repeatStart: start, repeatStartIndex: target, repeatNumber: 0, repeatAlternative: 0 };
}

/** Where a played measure ends, in sequence ticks. */
function playedEnd(header: MeasureHeader, move: number): number {
  return header.start + headerTicks(header) + move;
}

/** A measure read normally: repeats as TuxGuitar plays them, then the bar's first jump not taken yet. */
function normalStep(walk: Walk, headers: readonly MeasureHeader[], header: MeasureHeader, startNumber: number): WalkStep {
  const { repeat } = walk;
  const step = processHeader(repeat, header, startNumber);
  const played = step.shouldPlay ? { headerIndex: repeat.index, move: repeat.repeatMove } : undefined;
  const jump = played === undefined || step.state.index !== repeat.index + 1 ? undefined : takeJump(headers, repeat.index, walk.directions);
  if (played === undefined || jump === undefined) {
    return { walk: { ...walk, repeat: step.state }, played };
  }
  return { walk: { repeat: goTo(step.state, headers, jump.target, playedEnd(header, played.move)), directions: jump.state }, played };
}

/** A measure after a jump: no repeats, endings that go back skipped, then the Da Coda or the fine. */
function jumpedStep(walk: Walk, headers: readonly MeasureHeader[], header: MeasureHeader): WalkStep {
  const { repeat, directions } = walk;
  const skippedTo = skippedEndingEnd(headers, repeat.index);
  if (skippedTo !== undefined) {
    const skipped = headers.slice(repeat.index, skippedTo + 1).reduce((ticks, other) => ticks + headerTicks(other), 0);
    return { walk: { ...walk, repeat: { ...repeat, index: skippedTo + 1, repeatMove: repeat.repeatMove - skipped } } };
  }
  const played = { headerIndex: repeat.index, move: repeat.repeatMove };
  const lastIndex = Math.max(repeat.lastIndex, repeat.index);
  const coda = codaTarget(headers, repeat.index, directions.mode);
  if (coda !== undefined) {
    const next = goTo({ ...repeat, lastIndex }, headers, coda, playedEnd(header, played.move));
    return { walk: { repeat: next, directions: { ...directions, mode: 'normal' } }, played };
  }
  const index = endsAtFine(headers, repeat.index, directions.mode) ? headers.length : repeat.index + 1;
  return { walk: { ...walk, repeat: { ...repeat, index, lastIndex } }, played };
}

/**
 * The measures to play, in order, with repeats expanded and the musical directions followed (playback-directions.ts);
 * playback starts at `fromHeaderIndex`.
 */
export function buildPlaybackOrder(
  headers: readonly MeasureHeader[],
  fromHeaderIndex: number,
): readonly PlayedMeasure[] {
  const startNumber = fromHeaderIndex + 1;
  const played: PlayedMeasure[] = [];
  let walk: Walk = { repeat: INITIAL_STATE, directions: INITIAL_DIRECTIONS };
  let header = headers[walk.repeat.index];
  while (header !== undefined && played.length < MAX_PLAYED_MEASURES) {
    const step = walk.directions.mode === 'normal' ? normalStep(walk, headers, header, startNumber) : jumpedStep(walk, headers, header);
    if (step.played !== undefined) {
      played.push(step.played);
    }
    walk = step.walk;
    header = headers[walk.repeat.index];
  }
  return played;
}
