import type { Song } from '@gp-editor/core';
import ReactTestRenderer from 'react-test-renderer';
import { ScoreRow, type ScoreRowProps } from '../src/components/ScoreRow';
import { TAB, layoutMeasure } from '../src/lib/layout';
import { ScoreCanvas } from '../src/native/score-canvas';
import type { DrawCommand } from '../src/score/draw';
import { type ScoreMode, rowGeometry } from '../src/score/geometry';
import type { RowHit } from '../src/score/hit-test';
import { placeRow, rowHeaderWidth } from '../src/score/row';
import { PALETTE, textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note, onStrings } from '../test-support/songs';

/** The native canvas becomes a plain host element (`ScoreCanvas` below is that element), so its props can be read. */
jest.mock('../src/native/score-canvas', () => ({ ScoreCanvas: 'MockScoreCanvas' }));

const ROW_WIDTH = 800;

/** Bar 1: fret 3 on string 1, then fret 5 on string 2. Bars 2 and 3 hold one note each. */
const SONG = makeSong([
  [beat(header(1).start, [note(1, 3)]), beat(header(1).start + 960, [note(2, 5)])],
  [beat(header(2).start, [note(3, 7)])],
  [beat(header(3).start, [note(4, 9)])],
]);

function rowProps(song: Song, mode: ScoreMode, onPress: (hit: RowHit) => void): ScoreRowProps {
  const track = song.tracks[0]!;
  return {
    song,
    trackIndex: 0,
    row: { measures: [layoutMeasure(song, 0, 0)] },
    width: ROW_WIDTH,
    headerWidth: rowHeaderWidth(mode, track),
    mode,
    geometry: rowGeometry(mode, track.strings.length),
    palette: PALETTE,
    onPress,
  };
}

interface RenderedRow {
  readonly props: ScoreRowProps;
  readonly onPress: jest.Mock<void, [RowHit]>;
  readonly canvas: () => { readonly commands: readonly DrawCommand[]; readonly style: unknown };
  readonly pressAt: (x: number, y: number) => void;
  readonly update: (next: ScoreRowProps) => void;
}

function render(mode: ScoreMode = 'notationAndTab', song: Song = SONG): RenderedRow {
  const onPress = jest.fn<void, [RowHit]>();
  const props = rowProps(song, mode, onPress);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ScoreRow {...props} />);
  });
  const canvas = () => renderer.root.findByType(ScoreCanvas);
  return {
    props,
    onPress,
    canvas: () => ({ commands: canvas().props.commands, style: canvas().props.style }),
    pressAt: (x, y) => ReactTestRenderer.act(() => pressHandler(canvas())({ nativeEvent: { locationX: x, locationY: y } })),
    update: (next) => ReactTestRenderer.act(() => renderer.update(<ScoreRow {...next} />)),
  };
}

/** The press handler a press on the canvas reaches: the nearest enclosing `onPress` (the row's Pressable). */
function pressHandler(canvas: ReactTestRenderer.ReactTestInstance): (event: unknown) => void {
  for (let node: ReactTestRenderer.ReactTestInstance | null = canvas; node !== null; node = node.parent) {
    if (typeof node.props.onPress === 'function') {
      return node.props.onPress;
    }
  }
  throw new Error('Nothing around the canvas handles presses');
}

/** Centre of beat `beatIndex` of the row's first bar, on the tab line of `string`. */
function tabPoint(props: ScoreRowProps, beatIndex: number, string: number): { readonly x: number; readonly y: number } {
  const [first] = placeRow(props.row, props.headerWidth);
  const beatX = first?.layout.beats[beatIndex]?.x ?? Number.NaN;
  const tabTop = props.geometry.tabTop ?? Number.NaN;
  return { x: (first?.x ?? Number.NaN) + beatX, y: tabTop + (string - 1) * TAB.stringGap };
}

describe('ScoreRow drawing', () => {
  it('hands the canvas the row’s draw commands, frets included, at the row’s size', () => {
    // Act
    const row = render();

    // Assert
    const { commands, style } = row.canvas();
    expect(commands.length).toBeGreaterThan(0);
    expect(textValues(commands)).toEqual(expect.arrayContaining(['3', '5']));
    expect(textValues(commands)).not.toContain('7');
    expect(style).toEqual({ width: ROW_WIDTH, height: row.props.geometry.height });
  });

  it('draws nothing for a track the song does not have', () => {
    const row = render();
    row.update({ ...row.props, trackIndex: 3 });
    expect(row.canvas().commands).toEqual([]);
  });

  it('keeps the drawing when an edit leaves the row and its neighbours alone', () => {
    // Arrange
    const row = render();
    const before = row.canvas().commands;
    const track = SONG.tracks[0]!;
    const edited: Song = { ...SONG, tracks: [{ ...track, measures: [track.measures[0]!, track.measures[1]!, { ...track.measures[2]!, beats: [] }] }] };

    // Act
    row.update({ ...row.props, song: edited });

    // Assert
    expect(row.canvas().commands).toBe(before);
  });

  it('redraws the row when its track is retuned', () => {
    // Arrange
    const row = render();
    const before = row.canvas().commands;

    // Act: drop D
    row.update({ ...row.props, song: onStrings(SONG, [64, 59, 55, 50, 45, 38]) });

    // Assert
    expect(row.canvas().commands).not.toBe(before);
  });
});

describe('ScoreRow presses', () => {
  it('calls onPress with the beat and string of the note pressed on the tab staff', () => {
    // Arrange
    const row = render();
    const { x, y } = tabPoint(row.props, 1, 2);

    // Act
    row.pressAt(x, y);

    // Assert
    expect(row.onPress).toHaveBeenCalledTimes(1);
    expect(row.onPress).toHaveBeenCalledWith({ measureIndex: 0, beatIndex: 1, string: 2 });
  });

  it('picks the beat but no string for a press on the notation staff', () => {
    // Arrange
    const row = render();
    const { x } = tabPoint(row.props, 0, 1);

    // Act
    row.pressAt(x, row.props.geometry.notationTop ?? Number.NaN);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({ measureIndex: 0, beatIndex: 0, string: undefined });
  });

  it('ignores a press past the last bar of the row', () => {
    const row = render();
    row.pressAt(ROW_WIDTH - 1, tabPoint(row.props, 0, 1).y);
    expect(row.onPress).not.toHaveBeenCalled();
  });

  it('finds the string on a bass track in tab-only mode', () => {
    // Arrange: four strings, the press on string 4
    const bass = onStrings(SONG, [43, 38, 33, 28]);
    const row = render('tab', bass);
    const { x, y } = tabPoint(row.props, 0, 4);

    // Act
    row.pressAt(x, y);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({ measureIndex: 0, beatIndex: 0, string: 4 });
  });
});
