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
  const rowTop = page.topMargin + page.headerHeight + rowIndex * page.rowHeight;
  return page.viewportHeight > 0 && rowTop + page.rowHeight / 2 <= page.viewportHeight;
}
