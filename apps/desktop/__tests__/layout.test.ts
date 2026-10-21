import { QUARTER } from '@gp-editor/core';
import { TAB, layoutMeasure, layoutRows, primaryVoice, staffHeight, stringY } from '../src/lib/layout';
import { beat, header, makeSong, note } from '../test-support/songs';

const EIGHTH = { ...QUARTER, value: 8 as const };

describe('layoutMeasure', () => {
  it('places beats left to right and shows time signature and tempo on the first bar', () => {
    const song = makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 2)], EIGHTH)]]);
    const layout = layoutMeasure(song, 0, 0);
    expect(layout.showTimeSignature).toBe(true);
    expect(layout.showTempo).toBe(true);
    const [first, second] = layout.beats;
    expect(first!.x).toBeLessThan(second!.x);
    expect(layout.width).toBeGreaterThan(second!.x);
  });

  it('hides unchanged time signature and tempo, shows changes', () => {
    const headers = [header(1), header(2), header(3, { tempo: 90, timeSignature: { numerator: 3, denominator: 4 } })];
    const song = makeSong([[], [], []], headers);
    expect(layoutMeasure(song, 0, 1)).toMatchObject({ showTimeSignature: false, showTempo: false });
    expect(layoutMeasure(song, 0, 2)).toMatchObject({ showTimeSignature: true, showTempo: true });
  });

  it('gives empty bars a minimum width and reserves room for repeats', () => {
    const plain = makeSong([[]], [header(1)]);
    const repeated = makeSong([[]], [header(1, { repeatOpen: true })]);
    expect(layoutMeasure(plain, 0, 0).width).toBeGreaterThanOrEqual(TAB.emptyMeasureWidth);
    expect(layoutMeasure(repeated, 0, 0).width).toBe(layoutMeasure(plain, 0, 0).width + TAB.repeatWidth);
    const closing = makeSong([[beat(960, [note(1, 0)])]], [header(1, { repeatClose: 2 })]);
    const open = makeSong([[beat(960, [note(1, 0)])]], [header(1)]);
    expect(layoutMeasure(closing, 0, 0).width).toBe(layoutMeasure(open, 0, 0).width + TAB.repeatWidth);
  });
});

describe('layoutRows', () => {
  const measure = (measureIndex: number, width: number) => ({
    measureIndex,
    width,
    beats: [{ beatIndex: 0, x: width / 2 }],
    showTimeSignature: false,
    showTempo: false,
  });

  it('wraps measures that do not fit and stretches full rows', () => {
    const rows = layoutRows([measure(0, 300), measure(1, 300), measure(2, 300)], 700);
    expect(rows.map((row) => row.measures.map((m) => m.measureIndex))).toEqual([[0, 1], [2]]);
    expect(rows[0]!.measures.reduce((sum, m) => sum + m.width, 0)).toBeCloseTo(700);
    expect(rows[0]!.measures[0]!.beats[0]!.x).toBeCloseTo(175);
    expect(rows[1]!.measures[0]!.width).toBe(300);
  });

  it('keeps an oversized measure on its own row unscaled', () => {
    const rows = layoutRows([measure(0, 900)], 700);
    expect(rows[0]!.measures[0]!.width).toBe(900);
  });
});

describe('staff geometry', () => {
  it('computes string positions and staff height', () => {
    expect(stringY(1)).toBe(TAB.top);
    expect(stringY(6) - stringY(1)).toBe(5 * TAB.stringGap);
    expect(staffHeight(6)).toBe(TAB.top + 5 * TAB.stringGap + TAB.bottom);
  });

  it('picks the first non-empty voice for rhythm', () => {
    const b = beat(960, []);
    const withEmptyFirst = { ...b, voices: [{ ...b.voices[0]!, isEmpty: true }, b.voices[0]!] };
    expect(primaryVoice(withEmptyFirst)).toBe(b.voices[0]);
  });
});
