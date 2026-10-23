// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader.createTempNotesBefore (LGPL-2.1): the time up to an event as beats of quantised durations.
import { durationFromTicks, durationTicks } from '../../model/defaults';
import type { Duration } from '../../model/song';
import { splitPreciseDurationApproximately } from './duration-split';
import type { HeaderTimeline } from './midi-headers';
import type { MidiSettings } from './midi-settings';
import { preciseTimeOf, toPreciseTime } from './precise-duration';

/** A note of a beat before it has a string: its pitch (transposition applied) and whether it continues the previous beat's. */
export interface RawNote {
  readonly pitch: number;
  readonly velocity: number;
  readonly isTied: boolean;
}

/** A beat of the first voice before strings are chosen; no notes = a rest. */
export interface RawBeat {
  readonly start: number;
  readonly duration: Duration;
  readonly notes: readonly RawNote[];
}

/** TempNote: a note that started and has not ended yet. */
export interface TempNote {
  readonly channel: number;
  readonly pitch: number;
  readonly velocity: number;
  /** False until the note's first beat is written; later beats hold it as a tied note. */
  shallBeTied: boolean;
}

/** One track's beats by measure header index while its events are read. */
export type RawMeasures = RawBeat[][];

/** A track's reading position: where the next beat starts, and the notes sounding there. */
export interface FillState {
  lastBeatEnd: number;
  readonly tempNotes: TempNote[];
}

export interface FillContext {
  readonly timeline: HeaderTimeline;
  readonly settings: MidiSettings;
}

/** Quantised durations for `ticks` from `start` in the measure; re-ordered when the list reads better the other way round. */
function fillDurations(context: FillContext, headerIndex: number, start: number, ticks: number): Duration[] {
  const { settings, timeline } = context;
  if (!settings.quantization) {
    return [durationFromTicks(ticks)];
  }
  const limits = { maxDurationValue: settings.maxDurationValue, maxDivision: settings.maxDivision };
  const durations = splitPreciseDurationApproximately(toPreciseTime(ticks), timeline.preciseLength(headerIndex), limits);
  const first = durations[0];
  const last = durations[durations.length - 1];
  if (first === undefined || last === undefined) {
    return durations;
  }
  // e.g. 1/16 + 1/2 reads better than 1/2 + 1/16 when the beat starts on a sixteenth (it will not work in all cases)
  const relativeStart = toPreciseTime(start - timeline.start(headerIndex));
  const isMisaligned = relativeStart % preciseTimeOf(first) !== 0 && relativeStart % preciseTimeOf(last) === 0;
  return isMisaligned ? [...durations].reverse() : durations;
}

/** A beat at the reading position holding every sounding note (tied after its first beat), or a rest. */
function addBeat(measures: RawMeasures, headerIndex: number, state: FillState, duration: Duration): void {
  const notes = state.tempNotes.map((tempNote): RawNote => ({ pitch: tempNote.pitch, velocity: tempNote.velocity, isTied: tempNote.shallBeTied }));
  for (const tempNote of state.tempNotes) {
    tempNote.shallBeTied = true;
  }
  const beats = measures[headerIndex] ?? [];
  beats.push({ start: state.lastBeatEnd, duration, notes });
  measures[headerIndex] = beats;
}

/**
 * createTempNotesBefore: fills the time from the reading position to `end` with beats of the sounding notes (rests when
 * none sound), measure by measure, so a note across a bar line becomes tied notes. A duration that would cross the bar
 * line is not written: the position moves to the bar line. Ends once `end` falls in the measure being filled.
 */
export function fillUntil(context: FillContext, measures: RawMeasures, state: FillState, end: number): void {
  let isDone = end === state.lastBeatEnd;
  while (!isDone) {
    const headerIndex = context.timeline.indexAt(state.lastBeatEnd);
    const measureEnd = context.timeline.start(headerIndex) + context.timeline.length(headerIndex);
    const durations = fillDurations(context, headerIndex, state.lastBeatEnd, Math.min(end, measureEnd) - state.lastBeatEnd);
    for (const duration of durations) {
      const beatEnd = state.lastBeatEnd + durationTicks(duration);
      if (beatEnd <= measureEnd) {
        addBeat(measures, headerIndex, state, duration);
        state.lastBeatEnd = beatEnd;
      } else {
        state.lastBeatEnd = measureEnd;
      }
    }
    if (durations.length === 0 && end > measureEnd) {
      // the time left in the measure rounds to nothing: the measure may end up short (the adjuster fills it)
      state.lastBeatEnd = measureEnd;
    }
    isDone = end <= measureEnd;
  }
}
