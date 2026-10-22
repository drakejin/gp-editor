import { TAB } from '../src/lib/layout';
import { hitTestRow } from '../src/score/hit-test';

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

  it('ignores clicks on empty measures or past the row', () => {
    expect(hitTestRow(placed, geometry, 6, 150, 100)).toBeUndefined();
    expect(hitTestRow(placed, geometry, 6, 900, 100)).toBeUndefined();
    expect(hitTestRow(placed, { height: 100 }, 6, 45, 100)).toEqual({ measureIndex: 4, beatIndex: 0, string: undefined });
  });
});
