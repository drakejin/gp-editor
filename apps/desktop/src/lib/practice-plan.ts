import { type MidiOptions, QUARTER_TIME, type Song, type TimelineEntry, entrySecondsAt, timelineIndexAt } from '@gp-editor/core';
import { type LoopRange, type PracticeSettings, resolveLoopRange } from '../state/practice';
import { resolveTrainerMaxTempo, trainerPassTempo } from './practice-tempo';

/** Passes of a loop rendered at once; when they end the next ones are rendered (a tiny gap there). */
export const LOOP_BATCH_PASSES = 8;
/** A long loop renders fewer passes at once, so one render stays near this many bars. */
export const LOOP_BATCH_MEASURES = 256;

/** Where to start playing: a bar (when looping, one inside the loop) and the loop pass the render begins with. */
export interface PlayRequest {
  /** Default: bar 1, or the loop's first bar. A bar outside the loop starts the loop at its first bar. */
  readonly measureIndex?: number;
  /** Song tick inside that bar to start from (a selection's first beat); default: the bar's start. */
  readonly tick?: number;
  /** 0-based pass of the loop the render starts with (later batches of an endless loop). Default 0. */
  readonly firstPassIndex?: number;
}

export interface LoopBatch {
  readonly range: LoopRange;
  readonly firstPassIndex: number;
  /** Tempo of each pass of this render, in BPM at the loop's first bar. */
  readonly passTempos: readonly number[];
}

/** One render to play: the renderMidi options, the bar the player starts at, and the loop batch it holds. */
export interface PlaybackPlan {
  readonly options: MidiOptions;
  readonly startMeasureIndex: number;
  /** Where in the start bar the player starts (song ticks); undefined: at the bar's start. */
  readonly startTick?: number;
  readonly loop?: LoopBatch;
}

/** The loop pass being played and its tempo (BPM at the loop's first bar). */
export interface LoopPass {
  readonly passIndex: number;
  readonly tempo: number;
}

/** Passes rendered at once for a loop: 8, fewer for a long loop, at least one. */
export function passesPerBatch(range: LoopRange): number {
  const length = range.toMeasureIndex - range.fromMeasureIndex + 1;
  return Math.max(1, Math.min(LOOP_BATCH_PASSES, Math.floor(LOOP_BATCH_MEASURES / length)));
}

/**
 * With an audio track, the passes of a render share one tempo: its time-pitch unit changes rate only roughly in time
 * (GPAudioTrackPlayer), so while the speed trainer raises the tempo each pass renders on its own.
 */
function sameTempoPasses(passTempos: readonly number[]): readonly number[] {
  const changeIndex = passTempos.findIndex((tempo) => tempo !== passTempos[0]);
  return changeIndex < 0 ? passTempos : passTempos.slice(0, changeIndex);
}

/** A batch of loop passes; undefined when the loop's first bar is missing (a song without bars). */
function planLoop(song: Song, practice: PracticeSettings, request: PlayRequest): PlaybackPlan | undefined {
  const range = resolveLoopRange(practice.loop, song.measureHeaders.length, request.measureIndex);
  const writtenTempo = song.measureHeaders[range.fromMeasureIndex]?.tempo;
  if (writtenTempo === undefined) {
    return undefined;
  }
  const startTempo = writtenTempo * practice.tempoScale;
  const maxTempo = resolveTrainerMaxTempo(practice.trainerMaxTempo, writtenTempo, practice.tempoScale);
  const firstPassIndex = request.firstPassIndex ?? 0;
  const batch = Array.from({ length: passesPerBatch(range) }, (_, offset) =>
    trainerPassTempo(startTempo, practice.trainerStep, maxTempo, firstPassIndex + offset),
  );
  const passTempos = song.audioTrack === undefined ? batch : sameTempoPasses(batch);
  const { measureIndex } = request;
  const isInside =
    measureIndex !== undefined && measureIndex >= range.fromMeasureIndex && measureIndex <= range.toMeasureIndex;
  return {
    options: {
      fromHeaderIndex: range.fromMeasureIndex,
      toHeaderIndex: range.toMeasureIndex,
      passTempoScales: passTempos.map((tempo) => tempo / writtenTempo),
    },
    startMeasureIndex: isInside ? measureIndex : range.fromMeasureIndex,
    startTick: isInside ? request.tick : undefined,
    loop: { range, firstPassIndex, passTempos },
  };
}

/** The song from a bar (clamped to the song) to its end, at the playback tempo. */
function planSong(song: Song, practice: PracticeSettings, request: PlayRequest): PlaybackPlan {
  const lastIndex = Math.max(0, song.measureHeaders.length - 1);
  const fromHeaderIndex = Math.min(lastIndex, Math.max(0, request.measureIndex ?? 0));
  const startTick = fromHeaderIndex === request.measureIndex ? request.tick : undefined;
  return { options: { fromHeaderIndex, passTempoScales: [practice.tempoScale] }, startMeasureIndex: fromHeaderIndex, startTick };
}

/** What to render: the song from a bar at the playback tempo, or a batch of loop passes (speed trainer applied). */
export function planPlayback(song: Song, practice: PracticeSettings, request: PlayRequest): PlaybackPlan {
  const loop = practice.isLooping ? planLoop(song, practice, request) : undefined;
  return loop ?? planSong(song, practice, request);
}

/** The request for the batch after `plan`'s: the loop goes on from its first bar, the pass count continuing. */
export function nextLoopBatch(plan: PlaybackPlan): PlayRequest {
  return { firstPassIndex: (plan.loop?.firstPassIndex ?? 0) + (plan.loop?.passTempos.length ?? 0) };
}

/**
 * Seconds into the render where a bar first plays — or, with `tick`, where that point of the bar plays (its offset at
 * the bar's tempo); 0 when the bar does not play.
 */
export function startSeconds(timeline: readonly TimelineEntry[], measureIndex: number, tick?: number): number {
  const entry = timeline.find((candidate) => candidate.headerIndex === measureIndex);
  if (entry === undefined) {
    return 0;
  }
  const offsetTicks = tick === undefined ? 0 : Math.max(0, Math.min(tick, entry.endTick ?? tick) - entry.tick);
  // A bar following the audio track may change tempo inside (at a sync point).
  if (entry.tempoChanges !== undefined) {
    return entrySecondsAt(entry, entry.tick + offsetTicks);
  }
  return entry.seconds + (offsetTicks / QUARTER_TIME) * (60 / entry.tempo);
}

/** The loop pass playing at `seconds` of a loop render; undefined when not looping or outside the render. */
export function loopPassAt(
  plan: PlaybackPlan,
  timeline: readonly TimelineEntry[],
  seconds: number,
): LoopPass | undefined {
  const index = timelineIndexAt(timeline, seconds);
  const passIndex = index === undefined ? undefined : timeline[index]?.passIndex ?? 0;
  const tempo = passIndex === undefined ? undefined : plan.loop?.passTempos[passIndex];
  if (plan.loop === undefined || passIndex === undefined || tempo === undefined) {
    return undefined;
  }
  return { passIndex: plan.loop.firstPassIndex + passIndex, tempo: Math.round(tempo) };
}
