import { MAX_TEMPO, MIN_TEMPO, roundTempo } from '@gp-editor/core';

/** −/+ step of the playback tempo and of the trainer's top tempo, in BPM. */
export const TEMPO_STEP = 5;
/** The playback tempo stays between a quarter and three times the written tempo … */
export const MIN_PLAYBACK_TEMPO_SCALE = 0.25;
export const MAX_PLAYBACK_TEMPO_SCALE = 3;
/** … and never under 20 BPM (unless the bar is written slower). */
export const MIN_PLAYBACK_TEMPO = 20;
/** Speed trainer: BPM added each pass of the loop, 0 (off) to 20. */
export const MAX_TRAINER_STEP = 20;
/** Default top tempo of the trainer: this many BPM above the playback tempo (or the written tempo, when higher). */
export const TRAINER_DEFAULT_RISE = 20;

export interface TempoBounds {
  readonly min: number;
  readonly max: number;
}

/** Lowest and highest playback tempo of a bar written at `writtenTempo`; the written tempo itself always fits. */
export function tempoBounds(writtenTempo: number): TempoBounds {
  const min = Math.max(MIN_PLAYBACK_TEMPO, Math.ceil(writtenTempo * MIN_PLAYBACK_TEMPO_SCALE));
  const max = Math.floor(writtenTempo * MAX_PLAYBACK_TEMPO_SCALE);
  return { min: Math.min(writtenTempo, min), max: Math.max(writtenTempo, max) };
}

function clampTempo(tempo: number, writtenTempo: number): number {
  const { min, max } = tempoBounds(writtenTempo);
  return Math.min(max, Math.max(min, tempo));
}

/** The playback tempo shown for a bar (BPM, two decimals at most): its written tempo times the tempo scale. */
export function playbackTempo(writtenTempo: number, tempoScale: number): number {
  return roundTempo(writtenTempo * tempoScale);
}

const TEMPO_TEXT = /^\d+([.,]\d*)?$/;

/** A typed tempo ("92.5", or "92,5" with a decimal comma) kept to two decimals; undefined unless it is 1–999. */
export function parseTempoText(text: string): number | undefined {
  const trimmed = text.trim();
  if (!TEMPO_TEXT.test(trimmed)) {
    return undefined;
  }
  const tempo = roundTempo(Number(trimmed.replace(',', '.')));
  return tempo >= MIN_TEMPO && tempo <= MAX_TEMPO ? tempo : undefined;
}

/** A tempo kept to two decimals and within 1–999. */
export function clampTypedTempo(tempo: number): number {
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, roundTempo(tempo)));
}

/** Relative speed (Guitar Pro's speed −/+): 5% steps between 25% and 200% of the written tempo. */
export const SPEED_STEP_PERCENT = 5;
export const MIN_SPEED_PERCENT = 25;
export const MAX_SPEED_PERCENT = 200;
const PERCENT = 100;

/** How close a speed must be to a 5% step to count as on it (scales are floating-point). */
const GRID_EPSILON = 1e-6;

/**
 * The tempo scale `delta` percent (a multiple of 5) up or down from `tempoScale`, on the 5% grid (a speed between two
 * steps first goes to the step in that direction), within 25%–200%. A speed already past the end it moves towards
 * stays as it is.
 */
export function shiftSpeedScale(tempoScale: number, delta: number): number {
  const percent = tempoScale * PERCENT;
  if ((delta > 0 && percent >= MAX_SPEED_PERCENT) || (delta < 0 && percent <= MIN_SPEED_PERCENT)) {
    return tempoScale;
  }
  const units = percent / SPEED_STEP_PERCENT;
  const nearest = Math.round(units);
  const from = Math.abs(nearest - units) < GRID_EPSILON ? nearest : delta > 0 ? Math.floor(units) : Math.ceil(units);
  const steps = Math.round(delta / SPEED_STEP_PERCENT);
  return Math.min(MAX_SPEED_PERCENT, Math.max(MIN_SPEED_PERCENT, (from + steps) * SPEED_STEP_PERCENT)) / PERCENT;
}

const MAX_CLICK_VELOCITY = 127;

/** The MIDI velocity of the metronome's accent at a volume of 0–100%; at least 1. */
export function metronomeVelocity(volumePercent: number): number {
  return Math.max(1, Math.min(MAX_CLICK_VELOCITY, Math.round((MAX_CLICK_VELOCITY * volumePercent) / PERCENT)));
}

/** The tempo scale as a percentage of the written tempo. */
export function tempoPercent(tempoScale: number): number {
  return Math.round(tempoScale * 100);
}

/** The tempo scale that plays a bar written at `writtenTempo` at `tempo` BPM, clamped to the bar's bounds. */
export function tempoScaleFor(tempo: number, writtenTempo: number): number {
  return clampTempo(tempo, writtenTempo) / writtenTempo;
}

/** The tempo scale after −/+: the shown tempo of a bar written at `writtenTempo` moved by `delta` BPM, clamped. */
export function shiftTempoScale(tempoScale: number, writtenTempo: number, delta: number): number {
  return tempoScaleFor(playbackTempo(writtenTempo, tempoScale) + delta, writtenTempo);
}

/**
 * Top tempo of the speed trainer for a loop whose first bar is written at `writtenTempo`: the one set, or the written
 * tempo or 20 BPM above the playback tempo, whichever is higher; clamped to the bar's bounds.
 */
export function resolveTrainerMaxTempo(maxTempo: number | undefined, writtenTempo: number, tempoScale: number): number {
  const fallback = Math.max(writtenTempo, playbackTempo(writtenTempo, tempoScale) + TRAINER_DEFAULT_RISE);
  return clampTempo(maxTempo ?? fallback, writtenTempo);
}

/** Tempo of pass `passIndex` (0-based) of a loop: `step` BPM faster each pass up to `maxTempo`, never below start. */
export function trainerPassTempo(startTempo: number, step: number, maxTempo: number, passIndex: number): number {
  return Math.max(startTempo, Math.min(maxTempo, startTempo + passIndex * step));
}
