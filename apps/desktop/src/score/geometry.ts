import { TAB } from '../lib/layout';
import { NOTATION, notationBandHeight } from './notation';

/** What the score shows: standard notation and tab (default), notation only, or tab only. */
export type ScoreMode = 'notationAndTab' | 'notation' | 'tab';

export const SCORE_MODES: readonly ScoreMode[] = ['notationAndTab', 'notation', 'tab'];

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
  /** Centre of the effect marks row. */
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

export function rowGeometry(mode: ScoreMode, stringCount: number): RowGeometry {
  let y = ROW.heading;
  let notationTop: number | undefined;
  if (showsNotation(mode)) {
    notationTop = y + NOTATION.above;
    y += notationBandHeight();
  }
  if (!showsTab(mode)) {
    return { notationTop, height: y + ROW.gap };
  }
  const marksY = y + ROW.marks / 2;
  const tabTop = y + ROW.marks;
  y = tabTop + Math.max(0, stringCount - 1) * TAB.stringGap + (mode === 'tab' ? ROW.rhythm : ROW.tabBottom);
  return { notationTop, marksY, tabTop, height: y + ROW.gap };
}
