import { type Song, type TimelineEntry, meterBeats, positionAt } from '@gp-editor/core';

/** The beat the metronome is on (the visual metronome): which beat of how many, and whether it is the count-in. */
export interface MetronomeBeat {
  /** 0-based; 0 is the accented first beat. */
  readonly index: number;
  readonly count: number;
  readonly isCountIn: boolean;
}

/** One bar of `count` beats lasting `seconds`, `elapsed` seconds in. */
function countedBeat(count: number, seconds: number, elapsed: number, isCountIn: boolean): MetronomeBeat {
  const index = Math.min(count - 1, Math.max(0, Math.floor((elapsed * count) / seconds)));
  return { index, count, isCountIn };
}

/**
 * The metronome's beat at `seconds` of a render: during the count-in (the `countInSeconds` before its first bar) a
 * beat of that bar's meter, then the beat of the bar being played (meterBeats: 6/8 in two). Undefined before the
 * render starts and past its end.
 */
export function metronomeBeatAt(song: Song, timeline: readonly TimelineEntry[], countInSeconds: number, seconds: number): MetronomeBeat | undefined {
  const first = timeline[0];
  if (first === undefined || seconds < 0) {
    return undefined;
  }
  if (seconds < first.seconds) {
    const header = song.measureHeaders[first.headerIndex];
    const countInStart = first.seconds - countInSeconds;
    return header === undefined || countInSeconds <= 0 || seconds < countInStart
      ? undefined
      : countedBeat(meterBeats(header.timeSignature).count, countInSeconds, seconds - countInStart, true);
  }
  const at = positionAt(timeline, seconds);
  const header = at === undefined ? undefined : song.measureHeaders[at.headerIndex];
  if (at === undefined || header === undefined) {
    return undefined;
  }
  const { count, beatTicks } = meterBeats(header.timeSignature);
  return { index: Math.min(count - 1, Math.max(0, Math.floor((at.tick - header.start) / beatTicks))), count, isCountIn: false };
}

export function isSameBeat(a: MetronomeBeat | undefined, b: MetronomeBeat | undefined): boolean {
  return a?.index === b?.index && a?.count === b?.count && a?.isCountIn === b?.isCountIn;
}
