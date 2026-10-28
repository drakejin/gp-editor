import { TAB } from '../src/lib/layout';
import { hitTestDrag, hitTestRow } from '../src/score/hit-test';

const measure = (measureIndex: number, x: number, beatXs: number[]) => ({
  x,
  layout: { measureIndex, width: 100, beats: beatXs.map((bx, beatIndex) => ({ beatIndex, x: bx })), showTimeSignature: false, showTempo: false, showTripletFeel: false },
});
const placed = [measure(4, 40, [20, 60]), measure(5, 140, [])];
const geometry = { tabTop: 100, height: 200 };

describe('hitTestRow', () => {
  it('finds the nearest beat in the measure under the click and the nearest string on the tab staff', () => {
    expect(hitTestRow(placed, geometry, 6, 95, 100 + TAB.stringGap * 2 + 3)).toEqual({ measureIndex: 4, beatIndex: 1, string: 3 });
    expect(hitTestRow(placed, geometry, 6, 45, 100)).toEqual({ measureIndex: 4, beatIndex: 0, string: 1 });
  });

  it('gives no string above the tab staff and treats the row header as the first measure', () => {
    expect(hitTestRow(placed, geometry, 6, 10, 20)).toEqual({ measureIndex: 4, beatIndex: 0, string: undefined });
  });

  it('puts a click on a bar without beats (the track rests there) on its beat 0', () => {
    expect(hitTestRow(placed, geometry, 6, 150, 100 + TAB.stringGap)).toEqual({ measureIndex: 5, beatIndex: 0, string: 2 });
    expect(hitTestRow([measure(5, 0, [])], geometry, 6, 80, 20)).toEqual({ measureIndex: 5, beatIndex: 0, string: undefined });
  });

  it('ignores clicks past the row', () => {
    expect(hitTestRow(placed, geometry, 6, 900, 100)).toBeUndefined();
    expect(hitTestRow(placed, { height: 100 }, 6, 45, 100)).toEqual({ measureIndex: 4, beatIndex: 0, string: undefined });
  });
});

/** One track's staff in each system: `tops[i]` its system's top, `staffTop` its place in the system. */
const dragRows = (placedRows: (typeof placed)[], tops: number[], staffTop = 0) =>
  placedRows.map((row, i) => ({ placed: row, geometry, systemTop: tops[i] ?? 0, staffTop: (tops[i] ?? 0) + staffTop }));

describe('hitTestDrag', () => {
  const rowA = [measure(0, 40, [20, 60]), measure(1, 140, [20, 60])];
  const rowB = [measure(2, 40, [20, 60]), measure(3, 140, [20, 60])];
  const rows = dragRows([rowA, rowB], [0, geometry.height]);

  it('finds the beat under the pointer in the row where the drag began', () => {
    expect(hitTestDrag(rows, 0, 6, 165, 30)).toMatchObject({ measureIndex: 1, beatIndex: 0 });
  });

  it('follows the pointer into the row below or above', () => {
    expect(hitTestDrag(rows, 0, 6, 95, geometry.height + 30)).toMatchObject({ measureIndex: 2, beatIndex: 1 });
    expect(hitTestDrag(rows, 1, 6, 95, -30)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
  });

  it('stays on the first and last rows beyond them, and on the row’s ends beside it', () => {
    expect(hitTestDrag(rows, 0, 6, 95, -500)).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(hitTestDrag(rows, 0, 6, 95, geometry.height * 9)).toMatchObject({ measureIndex: 2, beatIndex: 1 });
    expect(hitTestDrag(rows, 0, 6, 5000, 30)).toMatchObject({ measureIndex: 1, beatIndex: 1 });
  });

  it('finds nothing without rows', () => {
    expect(hitTestDrag([], 0, 6, 95, 30)).toBeUndefined();
  });

  it('takes each system as tall as it is: a short system ends where the next one starts', () => {
    // Arrange: the first system 80 points tall, the second 400
    const uneven = dragRows([rowA, rowB, rowA], [0, 80, 480]);

    // Act
    const inSecond = hitTestDrag(uneven, 0, 6, 95, 80 + 100 + TAB.stringGap);
    const inThird = hitTestDrag(uneven, 1, 6, 95, 400 + 5);

    // Assert
    expect(inSecond).toMatchObject({ measureIndex: 2, beatIndex: 1, string: 2 });
    expect(inThird).toMatchObject({ measureIndex: 0, beatIndex: 1 });
  });

  it('reaches a bar without beats', () => {
    expect(hitTestDrag(dragRows([[measure(0, 40, [20, 60]), measure(1, 140, [])]], [0]), 0, 6, 190, 30)).toMatchObject({ measureIndex: 1, beatIndex: 0 });
  });
});

describe('hitTestDrag in a multitrack score', () => {
  // Staff 2 of each system: 120 points from the system's top; systems are 500 points apart.
  const rowA = [measure(0, 40, [20, 60]), measure(1, 140, [20, 60])];
  const rowB = [measure(2, 40, [20, 60]), measure(3, 140, [20, 60])];
  const rows = dragRows([rowA, rowB], [0, 500], 120);

  it('stays on the staff of the track the drag began on, over the other tracks’ staves of its system', () => {
    // Act: the pointer 100 points above the staff (on the staff of the track above) and 300 below it
    const above = hitTestDrag(rows, 0, 6, 95, -100);
    const below = hitTestDrag(rows, 0, 6, 95, 300);

    // Assert
    expect(above).toMatchObject({ measureIndex: 0, beatIndex: 1 });
    expect(below).toMatchObject({ measureIndex: 0, beatIndex: 1 });
  });

  it('reaches the same track’s staff in the next system a system’s height further', () => {
    expect(hitTestDrag(rows, 0, 6, 95, 500 + 100 + TAB.stringGap)).toMatchObject({ measureIndex: 2, beatIndex: 1, string: 2 });
  });
});
