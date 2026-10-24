// The audio track's sync map (Guitar Pro 7/8's sync points; not in TuxGuitar): ticks of the played score ↔ seconds of the
// audio. The score is laid out as it plays from its first bar (repeats and jumps unfolded); between two sync points the
// audio follows the ticks linearly, before the first and after the last it keeps the pace of the nearest two; with one
// point or none it follows the written tempos (from that point, or from the track's start offset).
import { measureTicks } from '../model/defaults';
import { type AudioSyncPoint, QUARTER_TIME, type Song } from '../model/song';
import { buildPlaybackOrder } from '../midi/playback-order';

/** A bar as the song plays it from its start. */
export interface PlayedBar {
  readonly measureIndex: number;
  /** 0 = the bar's first time. */
  readonly occurrence: number;
  /** Where it starts on the played timeline: ticks from the start of the first played bar. */
  readonly tick: number;
  readonly length: number;
  /** Where it starts at the written tempos, in seconds from the first played bar. */
  readonly scoreSeconds: number;
  /** Its written tempo, quarter notes per minute. */
  readonly tempo: number;
}

/** A sync point placed on the played timeline. */
export interface SyncAnchor {
  readonly tick: number;
  readonly seconds: number;
  /** Index of the point in AudioTrack.syncPoints. */
  readonly pointIndex: number;
}

export interface SyncMap {
  readonly bars: readonly PlayedBar[];
  /** The sync points that play, each later in ticks and in seconds than the one before. */
  readonly anchors: readonly SyncAnchor[];
  /** Where the audio is when the score starts while there is no sync point. */
  readonly startSeconds: number;
}

/** A place on the played timeline: the played bar, its bar and occurrence, and the place in it (0–1). */
export interface PlayedPosition {
  readonly playedIndex: number;
  readonly measureIndex: number;
  readonly occurrence: number;
  readonly position: number;
}

/** Tempo of a song without bars (TGTempo's default). */
const DEFAULT_TEMPO = 120;
const SECONDS_PER_MINUTE = 60;

function ticksToSeconds(ticks: number, tempo: number): number {
  return (ticks / QUARTER_TIME) * (SECONDS_PER_MINUTE / tempo);
}

function secondsToTicks(seconds: number, tempo: number): number {
  return (seconds * tempo * QUARTER_TIME) / SECONDS_PER_MINUTE;
}

/** The song's bars in the order they play from its first bar, each with its occurrence, tick and written time. */
function playedBars(song: Song): readonly PlayedBar[] {
  const occurrences = new Map<number, number>();
  const bars: PlayedBar[] = [];
  let tick = 0;
  let scoreSeconds = 0;
  for (const played of buildPlaybackOrder(song.measureHeaders, 0)) {
    const header = song.measureHeaders[played.headerIndex];
    if (header !== undefined) {
      const occurrence = occurrences.get(played.headerIndex) ?? 0;
      occurrences.set(played.headerIndex, occurrence + 1);
      const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
      bars.push({ measureIndex: played.headerIndex, occurrence, tick, length, scoreSeconds, tempo: header.tempo });
      tick += length;
      scoreSeconds += ticksToSeconds(length, header.tempo);
    }
  }
  return bars;
}

/** Index of the last item whose key is at or before `value` (0 when none is): items sorted by key. */
function lastAtOrBefore<T>(items: readonly T[], value: number, key: (item: T) => number): number {
  let low = 0;
  let high = items.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const item = items[middle];
    if (item !== undefined && key(item) <= value) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, low);
}

/** Index of the played bar that is the `occurrence`th time `measureIndex` plays; undefined when it does not. */
export function playedBarIndex(map: Pick<SyncMap, 'bars'>, measureIndex: number, occurrence: number): number | undefined {
  const index = map.bars.findIndex((bar) => bar.measureIndex === measureIndex && bar.occurrence === occurrence);
  return index < 0 ? undefined : index;
}

/** Where a sync point lies on the played timeline; undefined when its bar does not play that often. */
export function syncPointTick(map: Pick<SyncMap, 'bars'>, point: AudioSyncPoint): number | undefined {
  const index = playedBarIndex(map, point.measureIndex, point.occurrence);
  const bar = index === undefined ? undefined : map.bars[index];
  return bar === undefined ? undefined : bar.tick + point.position * bar.length;
}

/** The points that play and keep the score's order, as anchors (points are in audio order). */
function buildAnchors(bars: readonly PlayedBar[], points: readonly AudioSyncPoint[]): readonly SyncAnchor[] {
  const barByPlace = new Map(bars.map((bar) => [`${bar.measureIndex}:${bar.occurrence}`, bar]));
  const anchors: SyncAnchor[] = [];
  points.forEach((point, pointIndex) => {
    const bar = barByPlace.get(`${point.measureIndex}:${point.occurrence}`);
    const tick = bar === undefined ? undefined : bar.tick + point.position * bar.length;
    const last = anchors[anchors.length - 1];
    if (tick !== undefined && (last === undefined || (tick > last.tick && point.seconds > last.seconds))) {
      anchors.push({ tick, seconds: point.seconds, pointIndex });
    }
  });
  return anchors;
}

/** The song's sync map: its played bars and its audio track's sync points (none without an audio track). */
export function buildSyncMap(song: Song): SyncMap {
  const bars = playedBars(song);
  const track = song.audioTrack;
  return { bars, anchors: buildAnchors(bars, track?.syncPoints ?? []), startSeconds: track?.startSeconds ?? 0 };
}

/** Seconds at the written tempos from the first played bar to a tick (the first and last bar's tempo outside). */
export function scoreSecondsAt(map: Pick<SyncMap, 'bars'>, tick: number): number {
  const bar = map.bars[lastAtOrBefore(map.bars, tick, (each) => each.tick)];
  return bar === undefined ? ticksToSeconds(tick, DEFAULT_TEMPO) : bar.scoreSeconds + ticksToSeconds(tick - bar.tick, bar.tempo);
}

/** The tick played `seconds` after the first played bar at the written tempos. */
function tickAtScoreSeconds(map: Pick<SyncMap, 'bars'>, seconds: number): number {
  const bar = map.bars[lastAtOrBefore(map.bars, seconds, (each) => each.scoreSeconds)];
  return bar === undefined ? secondsToTicks(seconds, DEFAULT_TEMPO) : bar.tick + secondsToTicks(seconds - bar.scoreSeconds, bar.tempo);
}

/** The two anchors of the segment that holds (or, outside them, is nearest to) a value; at least two anchors. */
function segmentAround(anchors: readonly SyncAnchor[], value: number, key: (anchor: SyncAnchor) => number): readonly [SyncAnchor, SyncAnchor] {
  const index = Math.min(anchors.length - 2, lastAtOrBefore(anchors, value, key));
  return [anchors[index] as SyncAnchor, anchors[index + 1] as SyncAnchor];
}

/** The moment of the audio heard at a tick of the played timeline. */
export function audioSecondsAt(map: SyncMap, tick: number): number {
  const { anchors } = map;
  const [first] = anchors;
  if (first === undefined) {
    return map.startSeconds + scoreSecondsAt(map, tick);
  }
  if (anchors.length === 1) {
    return first.seconds + scoreSecondsAt(map, tick) - scoreSecondsAt(map, first.tick);
  }
  const [from, to] = segmentAround(anchors, tick, (anchor) => anchor.tick);
  return from.seconds + ((tick - from.tick) * (to.seconds - from.seconds)) / (to.tick - from.tick);
}

/** The tick of the played timeline heard at a moment of the audio (the inverse of audioSecondsAt). */
export function tickAtAudioSeconds(map: SyncMap, seconds: number): number {
  const { anchors } = map;
  const [first] = anchors;
  if (first === undefined) {
    return tickAtScoreSeconds(map, seconds - map.startSeconds);
  }
  if (anchors.length === 1) {
    return tickAtScoreSeconds(map, seconds - first.seconds + scoreSecondsAt(map, first.tick));
  }
  const [from, to] = segmentAround(anchors, seconds, (anchor) => anchor.seconds);
  return from.tick + ((seconds - from.seconds) * (to.tick - from.tick)) / (to.seconds - from.seconds);
}

/** The played bar holding a tick and the place in it; undefined outside the played bars. */
export function playedPositionAt(map: Pick<SyncMap, 'bars'>, tick: number): PlayedPosition | undefined {
  const playedIndex = lastAtOrBefore(map.bars, tick, (bar) => bar.tick);
  const bar = map.bars[playedIndex];
  if (bar === undefined || tick < bar.tick || tick > bar.tick + bar.length) {
    return undefined;
  }
  return { playedIndex, measureIndex: bar.measureIndex, occurrence: bar.occurrence, position: (tick - bar.tick) / bar.length };
}
