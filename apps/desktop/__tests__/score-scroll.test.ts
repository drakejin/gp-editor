import { isLineOnFirstScreen, isRowOnFirstScreen } from '../src/lib/score-scroll';

describe('isRowOnFirstScreen', () => {
  // A page with a 120-point title block, rows 200 points high, 22 points of desk above the page.
  const page = { headerHeight: 120, rowHeight: 200, topMargin: 22 };

  it('takes a row whose top half shows under the title block as shown, before the page is scrolled', () => {
    expect(isRowOnFirstScreen(0, { ...page, viewportHeight: 400 })).toBe(true);
    expect(isRowOnFirstScreen(0, { ...page, viewportHeight: 242 })).toBe(true);
    expect(isRowOnFirstScreen(2, { ...page, viewportHeight: 650 })).toBe(true);
  });

  it('takes a row whose top half is below the view as not shown', () => {
    expect(isRowOnFirstScreen(0, { ...page, viewportHeight: 241 })).toBe(false);
    expect(isRowOnFirstScreen(2, { ...page, viewportHeight: 600 })).toBe(false);
    expect(isRowOnFirstScreen(30, { ...page, viewportHeight: 800 })).toBe(false);
  });

  it('shows nothing before the view has a height', () => {
    expect(isRowOnFirstScreen(0, { ...page, viewportHeight: 0 })).toBe(false);
  });
});

describe('isLineOnFirstScreen', () => {
  // The same page; a multitrack system's staves are lines of their own heights.
  const page = { headerHeight: 120, rowHeight: 200, topMargin: 22 };

  it('takes a staff whose top half shows as shown', () => {
    expect(isLineOnFirstScreen({ top: 300, height: 100 }, { ...page, viewportHeight: 492 })).toBe(true);
    expect(isLineOnFirstScreen({ top: 300, height: 100 }, { ...page, viewportHeight: 491 })).toBe(false);
  });

  it('places a row the way isRowOnFirstScreen does', () => {
    expect(isLineOnFirstScreen({ top: 400, height: 200 }, { ...page, viewportHeight: 650 })).toBe(isRowOnFirstScreen(2, { ...page, viewportHeight: 650 }));
  });
});
