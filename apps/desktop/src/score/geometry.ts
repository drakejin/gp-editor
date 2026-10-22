import type { Track } from '@gp-editor/core';
import { TAB } from '../lib/layout';
import { NOTATION, notationBandHeight } from './notation';
import { TAB_MARKS } from './symbols/tab-geometry';

/** What the score shows: standard notation and tab (default), notation only, or tab only. */
export type ScoreMode = 'notationAndTab' | 'notation' | 'tab';

export const SCORE_MODES: readonly ScoreMode[] = ['notationAndTab', 'notation', 'tab'];

/** Names of the modes on buttons and menus. */
export const SCORE_MODE_LABELS: Readonly<Record<ScoreMode, string>> = {
  notationAndTab: 'Score + Tab',
  notation: 'Score',
  tab: 'Tab',
};

/** A score mode from outside (a native event); anything unknown is the default, score + tab. */
export function toScoreMode(value: unknown): ScoreMode {
  return SCORE_MODES.find((mode) => mode === value) ?? 'notationAndTab';
}

/** Vertical bands of a score row, in points. */
export const ROW = {
  /** Measure numbers, markers, tempo and alternate endings. */
  heading: 34,
  /** Effect marks above the tab staff. */
  marks: 16,
  /** Under the tab staff when rhythm is drawn there (tab-only mode). */
  rhythm: 34,
  /** Under the tab staff otherwise. */
  tabBottom: 10,
  gap: 14,
  sidePadding: 24,
} as const;

/** Y positions inside a row; undefined when the band is not shown in the mode. */
export interface RowGeometry {
  /** Top line of the notation staff. */
  readonly notationTop?: number;
  /** Centre of the lowest effect-mark lane. */
  readonly marksY?: number;
  /** First (highest) string of the tab staff. */
  readonly tabTop?: number;
  readonly height: number;
}

export function showsNotation(mode: ScoreMode): boolean {
  return mode !== 'tab';
}

export function showsTab(mode: ScoreMode): boolean {
  return mode !== 'notation';
}

/** The neck above the score comes with the tab (Score + Tab and Tab modes); percussion tracks have no neck. */
export function showsFretboard(mode: ScoreMode, track: Track): boolean {
  return showsTab(mode) && !track.isPercussion;
}

/** `markLaneCount`: effect-mark lanes above the tab staff (one per kind of mark the track uses). */
export function rowGeometry(mode: ScoreMode, stringCount: number, markLaneCount = 1): RowGeometry {
  let y = ROW.heading;
  let notationTop: number | undefined;
  if (showsNotation(mode)) {
    notationTop = y + NOTATION.above;
    y += notationBandHeight();
  }
  if (!showsTab(mode)) {
    return { notationTop, height: y + ROW.gap };
  }
  const marksBand = ROW.marks + Math.max(0, markLaneCount - 1) * TAB_MARKS.laneHeight;
  // marksY is the centre of the lowest lane; further lanes stack upwards from it.
  const marksY = y + marksBand - ROW.marks / 2;
  const tabTop = y + marksBand;
  y = tabTop + Math.max(0, stringCount - 1) * TAB.stringGap + (mode === 'tab' ? ROW.rhythm : ROW.tabBottom);
  return { notationTop, marksY, tabTop, height: y + ROW.gap };
}
