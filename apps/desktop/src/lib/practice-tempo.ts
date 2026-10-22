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

/** The playback tempo shown for a bar (BPM, rounded): its written tempo times the tempo scale. */
export function playbackTempo(writtenTempo: number, tempoScale: number): number {
  return Math.round(writtenTempo * tempoScale);
}

/** The tempo scale as a percentage of the written tempo. */
export function tempoPercent(tempoScale: number): number {
  return Math.round(tempoScale * 100);
}

/** The tempo scale after −/+: the shown tempo of a bar written at `writtenTempo` moved by `delta` BPM, clamped. */
export function shiftTempoScale(tempoScale: number, writtenTempo: number, delta: number): number {
  return clampTempo(playbackTempo(writtenTempo, tempoScale) + delta, writtenTempo) / writtenTempo;
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
