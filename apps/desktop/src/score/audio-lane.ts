import { type AudioSyncPoint, type SyncMap, audioSecondsAt, playedPositionAt, tickAtAudioSeconds } from '@gp-editor/core';
import type { AudioPeaks } from '../lib/audio-track';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';

/**
 * The audio track's lane under the tracks panel: the recording's waveform along the time of the audio, the score's bars
 * placed over it through the sync points (the bar numbers in a strip on top), the sync points as markers, the cursor's
 * bar tinted and the playing moment as a line. x = LANE.padLeft + seconds × pixels per second.
 */
export const AUDIO_LANE = {
  height: 96,
  barStripHeight: 18,
  padLeft: 6,
  padRight: 24,
  /** Zoom levels, pixels per second of audio. */
  zooms: [10, 20, 40, 80, 160, 320],
  defaultZoomIndex: 2,
  /** A click this close to a marker (points) takes the marker. */
  markerHitWidth: 5,
  /** A bar number is written when its bar is at least this wide (else every fourth bar's). */
  minNumberedBarWidth: 22,
  numberSize: 9,
  markerHandle: 7,
} as const;

const CURSOR_TINT_ALPHA = '40';
const GRID_ALPHA = '66';
const NUMBER_EVERY = 4;

export interface AudioLaneInput {
  readonly map: SyncMap;
  readonly points: readonly AudioSyncPoint[];
  readonly peaks?: AudioPeaks;
  /** Length of the audio file; the waveform's when known. */
  readonly durationSeconds: number;
  readonly pixelsPerSecond: number;
  /** The song's bar numbers by measure index (MeasureHeader.number). */
  readonly barNumbers: readonly number[];
  readonly cursorMeasureIndex?: number;
  readonly selectedPointIndex?: number;
  /** The moment of the audio heard now, while it plays. */
  readonly playingSeconds?: number;
  /** The part of the lane drawn (content x), so a long recording is drawn a screen or so at a time. */
  readonly fromX: number;
  readonly toX: number;
  readonly palette: Palette;
}

/** What a click on the lane points at: a sync point's marker, or the moment of the audio and the bar heard there. */
export type AudioLaneHit =
  | { readonly kind: 'marker'; readonly pointIndex: number }
  | { readonly kind: 'audio'; readonly seconds: number; readonly measureIndex?: number; readonly occurrence?: number };

export function laneX(seconds: number, pixelsPerSecond: number): number {
  return AUDIO_LANE.padLeft + seconds * pixelsPerSecond;
}

export function laneSeconds(x: number, pixelsPerSecond: number): number {
  return (x - AUDIO_LANE.padLeft) / pixelsPerSecond;
}

/** Where the score's end is heard (the last played bar's end), so the lane reaches past the audio when the score does. */
function scoreEndSeconds(map: SyncMap): number {
  const last = map.bars.at(-1);
  return last === undefined ? 0 : audioSecondsAt(map, last.tick + last.length);
}

/** The lane's whole width: the audio, or the score when it runs on past it. */
export function laneWidth(map: SyncMap, durationSeconds: number, pixelsPerSecond: number): number {
  return Math.ceil(laneX(Math.max(durationSeconds, scoreEndSeconds(map), 1), pixelsPerSecond) + AUDIO_LANE.padRight);
}

/** The drawn window for a scroll position: three screens, moved a screen at a time (so scrolling rarely redraws). */
export function laneWindow(scrollX: number, viewportWidth: number, contentWidth: number): { readonly fromX: number; readonly toX: number } {
  const screen = Math.max(1, viewportWidth);
  const fromX = Math.max(0, Math.floor(scrollX / screen) * screen - screen);
  return { fromX, toX: Math.min(contentWidth, fromX + 3 * screen) };
}

/** The waveform: one polygon, the max of every pixel column left to right, then the min back. */
function waveform(input: AudioLaneInput, top: number, height: number): DrawCommand[] {
  const { peaks, pixelsPerSecond, fromX, toX } = input;
  if (peaks === undefined) {
    return [];
  }
  const middle = top + height / 2;
  const scale = (height / 2 - 1) / 127;
  const bucketCount = peaks.values.length / 2;
  const columns: { readonly x: number; readonly low: number; readonly high: number }[] = [];
  for (let x = Math.floor(fromX); x < toX; x++) {
    const first = Math.max(0, Math.floor(laneSeconds(x, pixelsPerSecond) * peaks.bucketsPerSecond));
    const last = Math.min(bucketCount, Math.ceil(laneSeconds(x + 1, pixelsPerSecond) * peaks.bucketsPerSecond));
    let low = 0;
    let high = 0;
    for (let bucket = first; bucket < last; bucket++) {
      low = Math.min(low, peaks.values[bucket * 2] ?? 0);
      high = Math.max(high, peaks.values[bucket * 2 + 1] ?? 0);
    }
    if (last > first) {
      columns.push({ x: x - fromX, low: middle - low * scale + 0.5, high: middle - high * scale - 0.5 });
    }
  }
  if (columns.length === 0) {
    return [];
  }
  const points = [...columns.flatMap((column) => [column.x, column.high]), ...[...columns].reverse().flatMap((column) => [column.x + 1, column.low])];
  return [{ kind: 'polygon', points, color: input.palette.chromeMuted }];
}

/** The played bars' starts over the audio, numbered when there is room, and the cursor's bar tinted. */
function barGrid(input: AudioLaneInput): DrawCommand[] {
  const { map, pixelsPerSecond, fromX, toX, palette } = input;
  const commands: DrawCommand[] = [];
  map.bars.forEach((bar) => {
    const x = laneX(audioSecondsAt(map, bar.tick), pixelsPerSecond) - fromX;
    const endX = laneX(audioSecondsAt(map, bar.tick + bar.length), pixelsPerSecond) - fromX;
    if (endX < 0 || x > toX - fromX) {
      return;
    }
    if (bar.measureIndex === input.cursorMeasureIndex) {
      commands.push({ kind: 'rect', x, y: AUDIO_LANE.barStripHeight, width: endX - x, height: AUDIO_LANE.height - AUDIO_LANE.barStripHeight, color: `${palette.chromeAccent}${CURSOR_TINT_ALPHA}` });
    }
    commands.push({ kind: 'line', x1: x + 0.5, y1: 0, x2: x + 0.5, y2: AUDIO_LANE.height, width: 1, color: `${palette.chromeMuted}${GRID_ALPHA}` });
    const number = input.barNumbers[bar.measureIndex] ?? bar.measureIndex + 1;
    if (endX - x >= AUDIO_LANE.minNumberedBarWidth || number % NUMBER_EVERY === 1) {
      commands.push({ kind: 'text', x: x + 3, y: AUDIO_LANE.barStripHeight / 2, text: String(number), size: AUDIO_LANE.numberSize, color: palette.chromeText, font: 'ui', align: 'left' });
    }
  });
  return commands;
}

/** A marker per sync point taking part in the map: a line through the lane and a handle in the bar strip. */
function markers(input: AudioLaneInput): DrawCommand[] {
  const { map, pixelsPerSecond, fromX, toX, palette } = input;
  return map.anchors.flatMap((anchor): DrawCommand[] => {
    const x = laneX(anchor.seconds, pixelsPerSecond) - fromX;
    if (x < -AUDIO_LANE.markerHandle || x > toX - fromX + AUDIO_LANE.markerHandle) {
      return [];
    }
    const isSelected = anchor.pointIndex === input.selectedPointIndex;
    const color = isSelected ? palette.chromeAccentText : palette.chromeAccent;
    const handle = AUDIO_LANE.markerHandle;
    return [
      { kind: 'line', x1: x, y1: 0, x2: x, y2: AUDIO_LANE.height, width: isSelected ? 2 : 1.5, color },
      { kind: 'polygon', points: [x - handle, 0, x + handle, 0, x, handle * 1.5], color },
    ];
  });
}

/** Everything the lane shows in its drawn window (commands relative to `fromX`). */
export function engraveAudioLane(input: AudioLaneInput): DrawCommand[] {
  const { palette, fromX, toX, pixelsPerSecond } = input;
  const width = toX - fromX;
  const audioFrom = Math.max(0, laneX(0, pixelsPerSecond) - fromX);
  const audioTo = Math.min(width, laneX(input.durationSeconds, pixelsPerSecond) - fromX);
  const waveTop = AUDIO_LANE.barStripHeight;
  const playing = input.playingSeconds === undefined ? undefined : laneX(input.playingSeconds, pixelsPerSecond) - fromX;
  return [
    { kind: 'rect', x: 0, y: 0, width, height: AUDIO_LANE.height, color: palette.chromeDeep },
    ...(audioTo > audioFrom ? [{ kind: 'rect' as const, x: audioFrom, y: waveTop, width: audioTo - audioFrom, height: AUDIO_LANE.height - waveTop, color: palette.chrome }] : []),
    ...barGrid(input),
    ...waveform(input, waveTop, AUDIO_LANE.height - waveTop),
    ...markers(input),
    ...(playing === undefined ? [] : [{ kind: 'line' as const, x1: playing, y1: 0, x2: playing, y2: AUDIO_LANE.height, width: 1.5, color: palette.chromeText }]),
  ];
}

/** The marker under content x (the nearest within AUDIO_LANE.markerHitWidth), else the moment and the bar heard there. */
export function hitTestAudioLane(map: SyncMap, pixelsPerSecond: number, x: number): AudioLaneHit {
  const nearest = map.anchors
    .map((anchor) => ({ pointIndex: anchor.pointIndex, distance: Math.abs(laneX(anchor.seconds, pixelsPerSecond) - x) }))
    .filter((candidate) => candidate.distance <= AUDIO_LANE.markerHitWidth)
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearest !== undefined) {
    return { kind: 'marker', pointIndex: nearest.pointIndex };
  }
  const seconds = laneSeconds(x, pixelsPerSecond);
  const position = playedPositionAt(map, tickAtAudioSeconds(map, seconds));
  return position === undefined ? { kind: 'audio', seconds } : { kind: 'audio', seconds, measureIndex: position.measureIndex, occurrence: position.occurrence };
}

/** Where a dragged marker goes: the moment under x, kept strictly between its neighbours (`range`) and in the audio. */
export function draggedSeconds(x: number, pixelsPerSecond: number, range: { readonly min: number; readonly max: number }): number {
  const margin = 1 / pixelsPerSecond;
  const lowest = range.min === 0 ? 0 : range.min + margin;
  return Math.min(range.max - margin, Math.max(lowest, laneSeconds(x, pixelsPerSecond)));
}

/** The scroll offset that shows content x with a margin; undefined when it is in view already. */
export function scrollToShow(x: number, scrollX: number, viewportWidth: number): number | undefined {
  const margin = Math.min(60, viewportWidth / 4);
  if (viewportWidth <= 0 || (x >= scrollX + margin && x <= scrollX + viewportWidth - margin)) {
    return undefined;
  }
  return Math.max(0, x - viewportWidth / 3);
}
