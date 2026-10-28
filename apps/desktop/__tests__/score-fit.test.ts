import { DEFAULT_STYLESHEET, type Stylesheet } from '@gp-editor/core';
import { PRINT_SCALE } from '../src/export/paper';
import { type ScoreViewport, fitScoreZoom, printArea } from '../src/lib/score-fit';
import { ZOOM_RANGE } from '../src/lib/score-zoom';

const A4 = DEFAULT_STYLESHEET;
const LETTER: Stylesheet = { ...DEFAULT_STYLESHEET, page: { ...DEFAULT_STYLESHEET.page, format: 'letter' } };
/** The desk around the page and the page's padding, as ScoreView draws them. */
const VIEW: ScoreViewport = { width: 1280, height: 694, deskMargin: 22, sidePadding: 24 };

describe('printArea', () => {
  it('is the stylesheet’s page and its width between the margins, in points', () => {
    // Act
    const area = printArea(A4);

    // Assert: A4 with 12.7 mm margins
    expect(area.width).toBe(595);
    expect(area.height).toBe(842);
    expect(area.printWidth).toBeCloseTo(595 - 2 * 36, 0);
  });
});

describe('fitScoreZoom', () => {
  it('keeps a zoom level as it is, the page as wide as the view', () => {
    expect(fitScoreZoom(0.75, VIEW, printArea(A4))).toEqual({ zoom: 0.75 });
  });

  it('fits the width: the screen breaks the bars into lines as the printed page does', () => {
    // Act
    const area = printArea(A4);
    const { zoom } = fitScoreZoom('fitWidth', VIEW, area);

    // Assert: the row is as many layout points as the print's (its width over the print scale)
    const rowWidth = (VIEW.width - 2 * VIEW.deskMargin - 2 * VIEW.sidePadding) / zoom;
    expect(rowWidth).toBeCloseTo(area.printWidth / PRINT_SCALE);
  });

  it('fits a whole printed page on the screen: a page as wide as the paper’s at that zoom, centred', () => {
    // Act
    const area = printArea(LETTER);
    const fit = fitScoreZoom('fitPage', VIEW, area);

    // Assert: the paper's height in the view's height, the lines broken as printed
    expect((area.height * fit.zoom) / PRINT_SCALE).toBeCloseTo(VIEW.height - 2 * VIEW.deskMargin);
    expect(fit.pageWidth).toBeDefined();
    expect(((fit.pageWidth ?? 0) - 2 * VIEW.sidePadding) / fit.zoom).toBeCloseTo(area.printWidth / PRINT_SCALE);
    expect(fit.pageWidth).toBeLessThan(VIEW.width - 2 * VIEW.deskMargin);
  });

  it('fits a page by its width when the view is taller than wide, and never past the zoom’s range', () => {
    // Arrange
    const tall: ScoreViewport = { ...VIEW, width: 500, height: 3000 };

    // Act
    const page = fitScoreZoom('fitPage', tall, printArea(A4));
    const tiny = fitScoreZoom('fitWidth', { ...VIEW, width: 60 }, printArea(A4));

    // Assert
    expect(page.zoom).toBeCloseTo(fitScoreZoom('fitWidth', tall, printArea(A4)).zoom);
    expect(tiny.zoom).toBe(ZOOM_RANGE.min);
  });
});
