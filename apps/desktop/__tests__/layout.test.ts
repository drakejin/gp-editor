import { QUARTER } from '@gp-editor/core';
import { BEND_MOVE_WIDTH, TAB, layoutMeasure, layoutRows, primaryVoice, squeezeRow, staffHeight, stringY } from '../src/lib/layout';
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

describe('layoutMeasure with bends', () => {
  const bend = (...values: number[]) => ({
    bend: { points: values.map((value, i) => ({ position: Math.round((i * 12) / (values.length - 1)), value })) },
  });

  it('widens a beat by the rises and falls of its bend so arrows and amounts do not overlap', () => {
    // Arrange: the same quarter note plain, bent once, and bent, released and bent again
    const plain = makeSong([[beat(960, [note(1, 3)])]]);
    const once = makeSong([[beat(960, [note(1, 3, bend(0, 4, 4))])]]);
    const twice = makeSong([[beat(960, [note(1, 3, bend(0, 4, 0, 4))])]]);

    // Act
    const plainWidth = layoutMeasure(plain, 0, 0).width;
    const onceWidth = layoutMeasure(once, 0, 0).width;
    const twiceWidth = layoutMeasure(twice, 0, 0).width;

    // Assert
    expect(onceWidth).toBe(plainWidth);
    expect(twiceWidth - plainWidth).toBeGreaterThanOrEqual(2 * BEND_MOVE_WIDTH);
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

  it('stretches a short row in the middle of the score but not the last row', () => {
    const rows = layoutRows([measure(0, 200), measure(1, 600), measure(2, 200)], 700);
    expect(rows.map((row) => row.measures.map((m) => m.measureIndex))).toEqual([[0], [1], [2]]);
    expect(rows[0]!.measures[0]!.width).toBeCloseTo(700);
    expect(rows[2]!.measures[0]!.width).toBe(200);
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

describe('squeezeRow', () => {
  /** One bar of 32 eighth notes: wider than a 600 pt row. */
  function longBar() {
    const song = makeSong([Array.from({ length: 32 }, (_, i) => beat(960 + i * 480, [note(1, i % 12)], EIGHTH))]);
    return { measures: [layoutMeasure(song, 0, 0)] };
  }

  it('moves the beats of a row wider than the available width closer, so it fits exactly', () => {
    // Arrange
    const row = longBar();
    const [natural] = row.measures;

    // Act
    const [squeezed] = squeezeRow(row, 600).measures;

    // Assert
    expect(natural!.width).toBeGreaterThan(600);
    expect(squeezed!.width).toBeCloseTo(600, 6);
    expect(squeezed!.beats[0]!.x).toBe(natural!.beats[0]!.x);
    const lastBeat = (layout: typeof natural) => layout!.beats[layout!.beats.length - 1]!.x;
    expect(squeezed!.width - lastBeat(squeezed)).toBeCloseTo(natural!.width - lastBeat(natural), 6);
    squeezed!.beats.slice(1).forEach((b, i) => expect(b.x).toBeGreaterThan(squeezed!.beats[i]!.x));
  });

  it('keeps a row that fits as it is', () => {
    const row = longBar();
    expect(squeezeRow(row, 5000)).toBe(row);
  });
});
