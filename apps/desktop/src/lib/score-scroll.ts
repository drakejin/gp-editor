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
