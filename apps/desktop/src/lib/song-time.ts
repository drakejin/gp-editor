import { type MeasureHeader, QUARTER_TIME, type Song, measureTicks } from '@gp-editor/core';

const SECONDS_PER_MINUTE = 60;

/**
 * When each bar starts, in seconds from the first, played straight through (repeats not followed) at `tempoScale`
 * times the written tempos, or times `fixedTempo` (the tempo lock) — the bar times the top bar's display shows.
 */
export function measureStartSeconds(song: Song, tempoScale = 1, fixedTempo?: number): readonly number[] {
  let elapsed = 0;
  return song.measureHeaders.map((measureHeader) => {
    const start = elapsed;
    elapsed += barSeconds(measureHeader, tempoScale, fixedTempo);
    return start;
  });
}

/** Length of the song played straight through, in seconds. */
export function songSeconds(song: Song, tempoScale = 1, fixedTempo?: number): number {
  const last = song.measureHeaders.at(-1);
  if (last === undefined) {
    return 0;
  }
  const starts = measureStartSeconds(song, tempoScale, fixedTempo);
  return (starts.at(-1) ?? 0) + barSeconds(last, tempoScale, fixedTempo);
}

function barSeconds(measureHeader: MeasureHeader, tempoScale: number, fixedTempo: number | undefined): number {
  const { numerator, denominator } = measureHeader.timeSignature;
  const tempo = (fixedTempo ?? measureHeader.tempo) * tempoScale;
  return tempo > 0 ? (measureTicks(numerator, denominator) / QUARTER_TIME) * (SECONDS_PER_MINUTE / tempo) : 0;
}

/** "mm:ss" (minutes keep counting past 59). */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  return `${String(minutes).padStart(2, '0')}:${String(whole % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}
