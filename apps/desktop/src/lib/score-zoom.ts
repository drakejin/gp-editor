import { ZOOM_LEVELS } from '../state/panels';

/**
 * The score's zoom on screen: a level (1 = 100 %), or a fit to the stylesheet's printed page — `fitWidth`: the lines
 * broken as the page prints them, across the view; `fitPage`: a whole page on the screen (`score-fit.ts`). Kept as an
 * app setting, so this module imports nothing the settings do not (no cycle through the theme).
 */
export type ScoreZoom = number | 'fitWidth' | 'fitPage';

export const ZOOM_RANGE = { min: ZOOM_LEVELS[0] ?? 0.25, max: ZOOM_LEVELS.at(-1) ?? 4 } as const;

/** A zoom within ZOOM_RANGE. */
export const clampZoom = (zoom: number): number => Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom));

/** A stored zoom (untrusted): a level clamped to the range, a fit, else 100 %. */
export function parseScoreZoom(value: unknown): ScoreZoom {
  if (value === 'fitWidth' || value === 'fitPage') {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) ? clampZoom(value) : 1;
}
