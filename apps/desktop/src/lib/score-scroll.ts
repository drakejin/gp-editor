/** Where the score page sits in its scroll view, in screen points. */
export interface PageTop {
  /** The title block above the first row. */
  readonly headerHeight: number;
  readonly rowHeight: number;
  /** Desk above the page. */
  readonly topMargin: number;
  readonly viewportHeight: number;
}

/**
 * True when row `rowIndex` is in view while the page is not scrolled: its top half shows above the bottom of the view,
 * the title block above it. A page just shown (a file opened, another tab) is at the top until the list says which
 * rows it shows.
 */
export function isRowOnFirstScreen(rowIndex: number, page: PageTop): boolean {
  return isLineOnFirstScreen({ top: rowIndex * page.rowHeight, height: page.rowHeight }, page);
}

/** As isRowOnFirstScreen, for a line of the page (a staff of a multitrack system) `top` points under the title block. */
export function isLineOnFirstScreen(line: { readonly top: number; readonly height: number }, page: PageTop): boolean {
  const lineTop = page.topMargin + page.headerHeight + line.top;
  return page.viewportHeight > 0 && lineTop + line.height / 2 <= page.viewportHeight;
}

/** Where a line lands when the score scrolls to it (fraction of the view's free room above it): a quarter down. */
const SCROLL_FRACTION = 0.25;

/**
 * True when as much of a line shows as the view can hold — all of it, or a view's height of a line taller than the
 * view — with the page scrolled `scrollTop` points (the list's content offset); `top` is under the title block.
 */
export function isLineInView(line: { readonly top: number; readonly height: number }, page: Omit<PageTop, 'rowHeight'>, scrollTop: number): boolean {
  const lineTop = page.topMargin + page.headerHeight + line.top;
  const shown = Math.min(lineTop + line.height, scrollTop + page.viewportHeight) - Math.max(lineTop, scrollTop);
  return page.viewportHeight > 0 && shown >= Math.min(line.height, page.viewportHeight);
}

/** The list's viewPosition for a line `height` points tall: a quarter down the view, a line taller than it at its top. */
export function scrollPosition(height: number, viewportHeight: number): number {
  return height > viewportHeight ? 0 : SCROLL_FRACTION;
}
