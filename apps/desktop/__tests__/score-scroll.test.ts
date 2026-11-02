import { isLineInView, isLineOnFirstScreen, isRowOnFirstScreen, scrollPosition } from '../src/lib/score-scroll';

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

describe('isLineInView', () => {
  // The same page in a 400-point view: a line 300 points under the title block lies 442–642 points down the content.
  const page = { headerHeight: 120, topMargin: 22, viewportHeight: 400 };

  it('takes a line as shown only when all of it shows', () => {
    expect(isLineInView({ top: 300, height: 200 }, page, 300)).toBe(true);
    expect(isLineInView({ top: 300, height: 200 }, page, 242)).toBe(true);
    expect(isLineInView({ top: 300, height: 200 }, page, 241)).toBe(false);
    expect(isLineInView({ top: 300, height: 200 }, page, 443)).toBe(false);
  });

  it('takes a line taller than the view as shown while it fills the view', () => {
    expect(isLineInView({ top: 300, height: 600 }, page, 442)).toBe(true);
    expect(isLineInView({ top: 300, height: 600 }, page, 642)).toBe(true);
    expect(isLineInView({ top: 300, height: 600 }, page, 300)).toBe(false);
    expect(isLineInView({ top: 300, height: 600 }, page, 643)).toBe(false);
  });

  it('shows nothing before the view has a height', () => {
    expect(isLineInView({ top: 0, height: 10 }, { ...page, viewportHeight: 0 }, 0)).toBe(false);
  });
});

describe('scrollPosition', () => {
  it('puts a line that fits a quarter down the view, and a taller one at its top', () => {
    expect(scrollPosition(200, 400)).toBe(0.25);
    expect(scrollPosition(400, 400)).toBe(0.25);
    expect(scrollPosition(401, 400)).toBe(0);
  });
});
