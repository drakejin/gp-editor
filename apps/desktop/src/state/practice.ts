import type { Song } from '@gp-editor/core';
import { MAX_TRAINER_STEP, resolveTrainerMaxTempo, shiftTempoScale, tempoScaleFor } from '../lib/practice-tempo';

/** Bars a loop plays, first and last included (0-based, from ≤ to). */
export interface LoopRange {
  readonly fromMeasureIndex: number;
  readonly toMeasureIndex: number;
}

/** Practice settings of the session: playback speed, loop and speed trainer. They change playback, never the song. */
export interface PracticeSettings {
  /** Every tempo of the song is multiplied by it during playback (1 = as written). */
  readonly tempoScale: number;
  readonly isLooping: boolean;
  /** Set from the cursor's bar the first time the loop is turned on or an end is set. */
  readonly loop?: LoopRange;
  /** Speed trainer: BPM added on each pass of the loop (0 = off). */
  readonly trainerStep: number;
  /** Speed trainer: the pass tempo stops rising here; undefined = the default (see resolveTrainerMaxTempo). */
  readonly trainerMaxTempo?: number;
}

export const INITIAL_PRACTICE: PracticeSettings = { tempoScale: 1, isLooping: false, trainerStep: 0 };

/** The song's bar count, and the cursor's bar: where a loop not set yet starts and ends. */
export interface LoopScope {
  readonly measureCount: number;
  readonly cursorMeasureIndex: number;
}

/** Changes from the transport bar; `writtenTempo` is the written tempo of the bar the tempo is shown for. */
export type PracticeAction =
  | { readonly type: 'shiftTempo'; readonly delta: number; readonly writtenTempo: number }
  | { readonly type: 'resetTempo' }
  /** A percentage of the written tempo (0.8 = 80%). */
  | { readonly type: 'setTempoScale'; readonly scale: number; readonly writtenTempo: number }
  /** A tempo in BPM for the bar written at `writtenTempo`. */
  | { readonly type: 'setTempo'; readonly tempo: number; readonly writtenTempo: number }
  | ({ readonly type: 'toggleLoop' } & LoopScope)
  | ({ readonly type: 'setLoopFrom'; readonly measureIndex: number } & LoopScope)
  | ({ readonly type: 'setLoopTo'; readonly measureIndex: number } & LoopScope)
  | { readonly type: 'shiftTrainerStep'; readonly delta: number }
  | { readonly type: 'shiftTrainerMaxTempo'; readonly delta: number; readonly writtenTempo: number };

function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(0, count - 1), Math.max(0, Math.trunc(index)));
}

/** The loop clamped to a song of `measureCount` bars; the bar `fallbackIndex` when no loop was set yet. */
export function resolveLoopRange(loop: LoopRange | undefined, measureCount: number, fallbackIndex = 0): LoopRange {
  const from = clampIndex(loop?.fromMeasureIndex ?? fallbackIndex, measureCount);
  const to = clampIndex(loop?.toMeasureIndex ?? fallbackIndex, measureCount);
  return { fromMeasureIndex: Math.min(from, to), toMeasureIndex: Math.max(from, to) };
}

/** A new first bar; the last bar moves along when it would come before it. */
function withLoopFrom(loop: LoopRange | undefined, measureIndex: number, scope: LoopScope): LoopRange {
  const current = resolveLoopRange(loop, scope.measureCount, scope.cursorMeasureIndex);
  const from = clampIndex(measureIndex, scope.measureCount);
  return { fromMeasureIndex: from, toMeasureIndex: Math.max(from, current.toMeasureIndex) };
}

/** A new last bar; the first bar moves along when it would come after it. */
function withLoopTo(loop: LoopRange | undefined, measureIndex: number, scope: LoopScope): LoopRange {
  const current = resolveLoopRange(loop, scope.measureCount, scope.cursorMeasureIndex);
  const to = clampIndex(measureIndex, scope.measureCount);
  return { fromMeasureIndex: Math.min(to, current.fromMeasureIndex), toMeasureIndex: to };
}

function shiftTrainerMaxTempo(settings: PracticeSettings, delta: number, writtenTempo: number): number {
  const current = resolveTrainerMaxTempo(settings.trainerMaxTempo, writtenTempo, settings.tempoScale);
  return resolveTrainerMaxTempo(current + delta, writtenTempo, settings.tempoScale);
}

function applyPracticeAction(settings: PracticeSettings, action: PracticeAction): PracticeSettings {
  switch (action.type) {
    case 'shiftTempo':
      return { ...settings, tempoScale: shiftTempoScale(settings.tempoScale, action.writtenTempo, action.delta) };
    case 'resetTempo':
      return { ...settings, tempoScale: 1 };
    case 'setTempoScale':
      return { ...settings, tempoScale: tempoScaleFor(action.writtenTempo * action.scale, action.writtenTempo) };
    case 'setTempo':
      return { ...settings, tempoScale: tempoScaleFor(action.tempo, action.writtenTempo) };
    case 'toggleLoop':
      return {
        ...settings,
        isLooping: !settings.isLooping,
        loop: resolveLoopRange(settings.loop, action.measureCount, action.cursorMeasureIndex),
      };
    case 'setLoopFrom':
      return { ...settings, loop: withLoopFrom(settings.loop, action.measureIndex, action) };
    case 'setLoopTo':
      return { ...settings, loop: withLoopTo(settings.loop, action.measureIndex, action) };
    case 'shiftTrainerStep':
      return { ...settings, trainerStep: Math.min(MAX_TRAINER_STEP, Math.max(0, settings.trainerStep + action.delta)) };
    case 'shiftTrainerMaxTempo':
      return { ...settings, trainerMaxTempo: shiftTrainerMaxTempo(settings, action.delta, action.writtenTempo) };
  }
}

function isSameLoop(a: LoopRange | undefined, b: LoopRange | undefined): boolean {
  return a?.fromMeasureIndex === b?.fromMeasureIndex && a?.toMeasureIndex === b?.toMeasureIndex;
}

function isSamePractice(a: PracticeSettings, b: PracticeSettings): boolean {
  return (
    a.tempoScale === b.tempoScale &&
    a.isLooping === b.isLooping &&
    isSameLoop(a.loop, b.loop) &&
    a.trainerStep === b.trainerStep &&
    a.trainerMaxTempo === b.trainerMaxTempo
  );
}

/** Applies a transport-bar change; returns the same object when nothing changes (so playback is not restarted). */
export function practiceReducer(settings: PracticeSettings, action: PracticeAction): PracticeSettings {
  const next = applyPracticeAction(settings, action);
  return isSamePractice(settings, next) ? settings : next;
}

/** Written tempo of the bar playback starts from: the loop's first bar while looping, else the cursor's bar. */
export function playbackStartTempo(song: Song, settings: PracticeSettings, cursorMeasureIndex: number): number {
  const measureCount = song.measureHeaders.length;
  const startIndex = settings.isLooping ? resolveLoopRange(settings.loop, measureCount, cursorMeasureIndex).fromMeasureIndex : cursorMeasureIndex;
  return song.measureHeaders[startIndex]?.tempo ?? song.measureHeaders[0]?.tempo ?? DEFAULT_START_TEMPO;
}

/** Tempo assumed for a song without bars. */
const DEFAULT_START_TEMPO = 120;
