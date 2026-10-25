import { type MeasureLayout, layoutMeasure } from '../src/lib/layout';
import type { RectCommand } from '../src/score/draw';
import { rowGeometry } from '../src/score/geometry';
import { engraveRow } from '../src/score/row';
import { type BeatRange, clipRange, engraveSelection, isSameRange } from '../src/score/selection-tint';
import { stringY } from '../src/score/tab';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

function measure(measureIndex: number): MeasureLayout {
  return {
    measureIndex,
    width: 200,
    beats: [40, 80, 120, 160].map((x, beatIndex) => ({ beatIndex, x })),
    showTimeSignature: false,
    showTempo: false,
    showTripletFeel: false,
  };
}

function range(first: [number, number], last: [number, number]): BeatRange {
  return { first: { measureIndex: first[0], beatIndex: first[1] }, last: { measureIndex: last[0], beatIndex: last[1] } };
}

function tint(selection: BeatRange | undefined, measureIndex: number, mode: 'tab' | 'notation' | 'notationAndTab' = 'tab'): RectCommand | undefined {
  const [command] = engraveSelection(selection, measure(measureIndex), rowGeometry(mode, 6), 6, PALETTE);
  return command?.kind === 'rect' ? command : undefined;
}

describe('engraveSelection', () => {
  it('tints the selected beats of a bar, half way to their neighbours', () => {
    const rect = tint(range([0, 1], [0, 2]), 0);
    expect(rect).toMatchObject({ x: 60, width: 80, color: `${PALETTE.accent}26` });
  });

  it('reaches the bar lines where the selection goes on into the next or comes from the previous bar', () => {
    const selection = range([0, 2], [2, 1]);
    expect(tint(selection, 0)).toMatchObject({ x: 100, width: 100 });
    expect(tint(selection, 1)).toMatchObject({ x: 0, width: 200 });
    expect(tint(selection, 2)).toMatchObject({ x: 0, width: 100 });
  });

  it('tints the whole of a bar without beats the selection reaches, and none outside it', () => {
    const empty: MeasureLayout = { ...measure(1), beats: [] };
    const tintOf = (selection: BeatRange) => engraveSelection(selection, empty, rowGeometry('tab', 6), 6, PALETTE)[0];
    expect(tintOf(range([1, 0], [1, 0]))).toMatchObject({ kind: 'rect', x: 0, width: 200 });
    expect(tintOf(range([0, 2], [2, 0]))).toMatchObject({ kind: 'rect', x: 0, width: 200 });
    expect(tintOf(range([2, 0], [3, 0]))).toBeUndefined();
  });

  it('goes a little past the first and last beat of a bar when the selection ends there', () => {
    expect(tint(range([0, 0], [0, 3]), 0)).toMatchObject({ x: 28, width: 144 });
  });

  it('covers the staves the view shows', () => {
    // Arrange
    const selection = range([0, 0], [0, 0]);
    const tabGeometry = rowGeometry('tab', 6);
    const bothGeometry = rowGeometry('notationAndTab', 6);

    // Act
    const tabOnly = tint(selection, 0, 'tab');
    const both = tint(selection, 0, 'notationAndTab');
    const notation = tint(selection, 0, 'notation');

    // Assert
    expect(tabOnly).toMatchObject({ y: tabGeometry.tabTop! - 10, height: stringY(tabGeometry.tabTop!, 6) - tabGeometry.tabTop! + 20 });
    expect(both?.y).toBe(bothGeometry.notationTop! - 10);
    expect(notation?.height).toBe(32 + 20);
  });

  it('is drawn over the measure by the row engraver', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3)]), beat(1920, [note(2, 5)])]]);
    const context = {
      song, trackIndex: 0, row: { measures: [layoutMeasure(song, 0, 0)] }, headerWidth: 40, mode: 'tab' as const,
      geometry: rowGeometry('tab', 6), palette: PALETTE,
    };
    const isTint = (command: { readonly kind: string; readonly color?: string }) => command.kind === 'rect' && command.color === `${PALETTE.accent}26`;

    // Act
    const plain = engraveRow(context);
    const selected = engraveRow({ ...context, selection: range([0, 0], [0, 1]) });

    // Assert
    expect(plain.some(isTint)).toBe(false);
    expect(selected.filter(isTint)).toHaveLength(1);
    expect(isTint(selected[selected.length - 1]!)).toBe(true);
  });

  it('draws nothing outside the selection', () => {
    expect(tint(undefined, 0)).toBeUndefined();
    expect(tint(range([1, 0], [1, 3]), 0)).toBeUndefined();
    expect(tint(range([0, 0], [0, 3]), 1)).toBeUndefined();
  });
});

describe('clipRange', () => {
  it('cuts a selection to the bars of a row, so a row in the middle keeps the same range', () => {
    // Arrange
    const longer = range([0, 2], [9, 1]);
    const shorter = range([0, 2], [8, 3]);

    // Act
    const middleOfLonger = clipRange(longer, 3, 5);
    const middleOfShorter = clipRange(shorter, 3, 5);

    // Assert
    expect(middleOfLonger).toEqual(range([3, 0], [5, Number.MAX_SAFE_INTEGER]));
    expect(isSameRange(middleOfLonger, middleOfShorter)).toBe(true);
  });

  it('keeps the ends inside the row and leaves rows without selected beats out', () => {
    expect(clipRange(range([4, 1], [4, 2]), 3, 5)).toEqual(range([4, 1], [4, 2]));
    expect(clipRange(range([0, 1], [2, 2]), 3, 5)).toBeUndefined();
    expect(clipRange(undefined, 3, 5)).toBeUndefined();
  });
});

describe('isSameRange', () => {
  it('compares the ends', () => {
    expect(isSameRange(range([0, 1], [1, 2]), range([0, 1], [1, 2]))).toBe(true);
    expect(isSameRange(range([0, 1], [1, 2]), range([0, 1], [1, 3]))).toBe(false);
    expect(isSameRange(undefined, range([0, 1], [1, 2]))).toBe(false);
    expect(isSameRange(undefined, undefined)).toBe(true);
  });
});
