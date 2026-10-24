// Playback timeline: when each played measure starts, from the tempos written to the MIDI file (TGTempo.getInUSQ).
import { measureTicks } from '../model/defaults';
import { type MeasureHeader, QUARTER_TIME } from '../model/song';
import { type PlayedMeasure, playedTempo } from './playback-order';

export interface TimelineEntry {
  /** Seconds from the start of playback when this measure starts. */
  readonly seconds: number;
  readonly headerIndex: number;
  /** MeasureHeader.start of that measure (song ticks), so a position can be matched to beats. */
  readonly tick: number;
  /** Quarter notes per minute in effect at the start of this measure (its pass's tempo scale applied). */
  readonly tempo: number;
  /** Song tick where the measure ends (tick + its length). Always set by renderMidi. */
  readonly endTick?: number;
  /** Which pass over the played measures this is (index into MidiOptions.passTempoScales). Always set by renderMidi. */
  readonly passIndex?: number;
}

export interface ScorePosition {
  readonly headerIndex: number;
  readonly tick: number;
}

const MICROSECONDS_PER_SECOND = 1_000_000;
/** Tempo assumed when nothing is played (TGTempo's default). */
const DEFAULT_TEMPO = 120;

/** TGTempo.getInUSQ: microseconds per quarter note, truncated as in the MIDI tempo event. */
export function usqFromTempo(tempo: number): number {
  return Math.trunc((60 / tempo) * 1000 * 1000);
}

/** Seconds that `ticks` last at `tempo`, using the tempo as written to the MIDI file. */
export function secondsFromTicks(ticks: number, tempo: number): number {
  return (ticks * usqFromTempo(tempo)) / (QUARTER_TIME * MICROSECONDS_PER_SECOND);
}

function ticksFromSeconds(seconds: number, tempo: number): number {
  return (seconds * QUARTER_TIME * MICROSECONDS_PER_SECOND) / usqFromTempo(tempo);
}

export interface Timeline {
  readonly entries: readonly TimelineEntry[];
  /** Seconds at the end of the last played measure. */
  readonly endSeconds: number;
  /** Tempo of the last played measure (for time past its end). */
  readonly lastTempo: number;
}

/** One entry per played measure, in playback order; the first played measure starts at `startSeconds` (after a count-in). */
export function buildTimeline(headers: readonly MeasureHeader[], played: readonly PlayedMeasure[], startSeconds = 0): Timeline {
  const entries: TimelineEntry[] = [];
  let seconds = startSeconds;
  let lastTempo = DEFAULT_TEMPO;
  for (const measure of played) {
    const header = headers[measure.headerIndex];
    if (header !== undefined) {
      const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
      const tempo = playedTempo(header, measure);
      entries.push({
        seconds,
        headerIndex: measure.headerIndex,
        tick: header.start,
        tempo,
        endTick: header.start + length,
        passIndex: measure.passIndex ?? 0,
      });
      seconds += secondsFromTicks(length, tempo);
      lastTempo = tempo;
    }
  }
  return { entries, endSeconds: seconds, lastTempo };
}

/** Index of the last entry starting at or before `seconds` (entries are in time order). */
function entryIndexAt(timeline: readonly TimelineEntry[], seconds: number): number {
  let low = 0;
  let high = timeline.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((timeline[middle]?.seconds ?? Number.POSITIVE_INFINITY) <= seconds) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** Index of the timeline entry being played at a playback time; undefined before the start and past the end. */
export function timelineIndexAt(timeline: readonly TimelineEntry[], seconds: number): number | undefined {
  const first = timeline[0];
  if (first === undefined || !(seconds >= first.seconds)) {
    return undefined;
  }
  const index = entryIndexAt(timeline, seconds);
  const entry = timeline[index];
  const isPastEnd =
    index === timeline.length - 1 &&
    entry?.endTick !== undefined &&
    seconds >= entry.seconds + secondsFromTicks(entry.endTick - entry.tick, entry.tempo);
  return isPastEnd ? undefined : index;
}

/**
 * Score position at a playback time: the measure being played and the song tick inside it (tempo changes inside a
 * measure may be approximated by the measure's tempo). undefined before the start and past the end.
 */
export function positionAt(timeline: readonly TimelineEntry[], seconds: number): ScorePosition | undefined {
  const index = timelineIndexAt(timeline, seconds);
  const entry = index === undefined ? undefined : timeline[index];
  if (entry === undefined) {
    return undefined;
  }
  const tick = Math.floor(entry.tick + ticksFromSeconds(seconds - entry.seconds, entry.tempo));
  return {
    headerIndex: entry.headerIndex,
    tick: entry.endTick === undefined ? tick : Math.min(tick, entry.endTick - 1),
  };
}
