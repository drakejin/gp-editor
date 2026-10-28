import type { Stylesheet } from '@gp-editor/core';
import { PRINT_SCALE } from '../export/paper';
import { pageMargins, printedPage } from '../export/pdf-document';
import { ZOOM_LEVELS } from '../state/panels';

/**
 * The score's zoom on screen: a level (1 = 100 %), or a fit to the stylesheet's printed page — `fitWidth`: the lines
 * broken as the page prints them, across the view; `fitPage`: a whole page on the screen. Kept as an app setting.
 */
export type ScoreZoom = number | 'fitWidth' | 'fitPage';

export const ZOOM_RANGE = { min: ZOOM_LEVELS[0] ?? 0.25, max: ZOOM_LEVELS.at(-1) ?? 4 } as const;

/** The paper and the width the print's rows run across, in points. */
export interface PrintArea {
  readonly width: number;
  readonly height: number;
  readonly printWidth: number;
}

export function printArea(sheet: Stylesheet): PrintArea {
  const paper = printedPage(sheet.page);
  const margins = pageMargins(sheet.page);
  return { width: paper.width, height: paper.height, printWidth: paper.width - margins.left - margins.right };
}

/** The score's view on screen: its size, the desk around the page and the page's own padding. */
export interface ScoreViewport {
  readonly width: number;
  readonly height: number;
  readonly deskMargin: number;
  readonly sidePadding: number;
}

/** The zoom shown (screen points per layout point, before the stylesheet's scale), and a page narrower than the view when fitted to a page. */
export interface ScoreFit {
  readonly zoom: number;
  readonly pageWidth?: number;
}

const clampZoom = (zoom: number): number => Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom));

/**
 * The zoom a setting shows in the view. Rows are laid out at the stylesheet's scale and printed at PRINT_SCALE of it, so
 * a row as wide as the page's printable width over PRINT_SCALE breaks its bars as the page does, whatever the scale.
 */
export function fitScoreZoom(zoom: ScoreZoom, view: ScoreViewport, area: PrintArea): ScoreFit {
  if (typeof zoom === 'number') {
    return { zoom };
  }
  const pageWidth = Math.max(0, view.width - 2 * view.deskMargin);
  const widthZoom = ((pageWidth - 2 * view.sidePadding) * PRINT_SCALE) / area.printWidth;
  if (zoom === 'fitWidth') {
    return { zoom: clampZoom(widthZoom) };
  }
  const heightZoom = ((view.height - 2 * view.deskMargin) * PRINT_SCALE) / area.height;
  const fitted = clampZoom(Math.min(widthZoom, heightZoom));
  return { zoom: fitted, pageWidth: Math.min(pageWidth, (area.printWidth * fitted) / PRINT_SCALE + 2 * view.sidePadding) };
}

/** A stored zoom (untrusted): a level clamped to the range, a fit, else 100 %. */
export function parseScoreZoom(value: unknown): ScoreZoom {
  if (value === 'fitWidth' || value === 'fitPage') {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) ? clampZoom(value) : 1;
}
