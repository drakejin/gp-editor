// Playback following the audio track (not in TuxGuitar): Guitar Pro 7/8 play the score at the pace of the recording's
// sync points, so the recording plays untouched at full speed. Here: the tempos each played measure sounds at (from
// the sync map, the pass's practice speed applied), and the stretches of the audio heard under the render.
import { type PlayedBar, type SyncAnchor, type SyncMap, audioSecondsAt } from '../audio-track/sync-map';
import type { MeasureHeader } from '../model/song';
import { QUARTER_TIME } from '../model/song';
import type { PlayedMeasure, TempoPiece } from './playback-order';
import type { TimelineEntry } from './timeline';

/** A stretch of the audio track played under a render, without a break. */
export interface AudioRun {
  /** Seconds from the start of the render (its timeline) when it starts. */
  readonly atSeconds: number;
  /** The stretch of the audio, in seconds of the audio file; it may begin before 0 or end after the audio. */
  readonly fromSeconds: number;
  readonly toSeconds: number;
  /** Seconds of audio per second of the render: the pass's practice speed (the score follows the audio). */
  readonly rate: number;
}

/** The render's measures with the tempos that follow the audio, and each one's bar on the sync map (when it plays). */
export interface AudioSyncedMeasures {
  readonly played: readonly PlayedMeasure[];
  readonly bars: readonly (PlayedBar | undefined)[];
}

/** Bounds of a tempo following the audio, so two odd sync points cannot make a file the sequencer cannot play. */
const MIN_SYNC_TEMPO = 4;
const MAX_SYNC_TEMPO = 2000;
const SECONDS_PER_MINUTE = 60;
/** Two stretches closer than this (seconds) are one. */
const JOIN_TOLERANCE = 1e-3;

/**
 * Each measure of the render on the sync map's timeline: its occurrence counted within its pass (a loop plays a bar's
 * first time on every pass; the song from a bar counts from there), its first occurrence when the map has no such one.
 */
function barsOnMap(map: SyncMap, played: readonly PlayedMeasure[]): readonly (PlayedBar | undefined)[] {
  const byPlace = new Map(map.bars.map((bar) => [`${bar.measureIndex}:${bar.occurrence}`, bar]));
  const counts = new Map<string, number>();
  return played.map((measure) => {
    const key = `${measure.passIndex ?? 0}:${measure.headerIndex}`;
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return byPlace.get(`${measure.headerIndex}:${occurrence}`) ?? byPlace.get(`${measure.headerIndex}:0`);
  });
}

/** The anchors strictly inside (from, to), in order. */
function anchorsInside(anchors: readonly SyncAnchor[], from: number, to: number): readonly SyncAnchor[] {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((anchors[middle]?.tick ?? Number.POSITIVE_INFINITY) <= from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const inside: SyncAnchor[] = [];
  for (let index = low; index < anchors.length && (anchors[index]?.tick ?? to) < to; index++) {
    inside.push(anchors[index] as SyncAnchor);
  }
  return inside;
}

/** The quarter notes per minute that play the ticks `from`…`to` in the audio's time, times `scale`. */
function syncTempo(map: SyncMap, from: number, to: number, scale: number): number {
  const seconds = audioSecondsAt(map, to) - audioSecondsAt(map, from);
  const tempo = seconds > 0 ? ((to - from) / QUARTER_TIME) * (SECONDS_PER_MINUTE / seconds) * scale : MAX_SYNC_TEMPO;
  return Math.min(MAX_SYNC_TEMPO, Math.max(MIN_SYNC_TEMPO, tempo));
}

/** A played bar's tempos: one piece per stretch between the sync points inside it. */
function tempoPieces(map: SyncMap, bar: PlayedBar, scale: number): readonly TempoPiece[] {
  const end = bar.tick + bar.length;
  const bounds = [bar.tick, ...anchorsInside(map.anchors, bar.tick, end).map((anchor) => anchor.tick), end];
  return bounds.slice(0, -1).map((from, index) => ({
    offset: Math.round(from - bar.tick),
    tempo: syncTempo(map, from, bounds[index + 1] ?? end, scale),
  }));
}

/** The render's measures playing at the audio's pace (a measure whose bar is not on the map keeps its written tempo). */
export function syncToAudio(headers: readonly MeasureHeader[], played: readonly PlayedMeasure[], map: SyncMap): AudioSyncedMeasures {
  const bars = barsOnMap(map, played);
  return {
    played: played.map((measure, index) => {
      const bar = bars[index];
      return bar === undefined || headers[measure.headerIndex] === undefined ? measure : { ...measure, tempos: tempoPieces(map, bar, measure.tempoScale ?? 1) };
    }),
    bars,
  };
}

/** Whether `run` goes on with the audio from `fromSeconds` at `atSeconds` of the render, at the same rate. */
function isContinuedBy(run: AudioRun, atSeconds: number, fromSeconds: number, rate: number): boolean {
  const endsAt = run.atSeconds + (run.toSeconds - run.fromSeconds) / run.rate;
  return run.rate === rate && Math.abs(run.toSeconds - fromSeconds) < JOIN_TOLERANCE && Math.abs(endsAt - atSeconds) < JOIN_TOLERANCE;
}

/** The stretches of audio under the render: one per measure on the map, joined where the audio goes straight on. */
export function audioRunsOf(synced: AudioSyncedMeasures, timeline: readonly TimelineEntry[], map: SyncMap): readonly AudioRun[] {
  const runs: AudioRun[] = [];
  synced.played.forEach((measure, index) => {
    const bar = synced.bars[index];
    const entry = timeline[index];
    if (bar === undefined || entry === undefined) {
      return;
    }
    const fromSeconds = audioSecondsAt(map, bar.tick);
    const toSeconds = audioSecondsAt(map, bar.tick + bar.length);
    const rate = measure.tempoScale ?? 1;
    const last = runs[runs.length - 1];
    if (last !== undefined && isContinuedBy(last, entry.seconds, fromSeconds, rate)) {
      runs[runs.length - 1] = { ...last, toSeconds };
    } else {
      runs.push({ atSeconds: entry.seconds, fromSeconds, toSeconds, rate });
    }
  });
  return runs;
}
