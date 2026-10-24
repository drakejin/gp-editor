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
import { beat, header, makeSong, note, onStrings, toTux } from '../test-support/songs';

/** The native canvas becomes a plain host element (`ScoreCanvas` below is that element), so its props can be read. */
jest.mock('../src/native/score-canvas', () => ({
  ScoreCanvas: 'MockScoreCanvas',
}));

const ROW_WIDTH = 800;

/** Bar 1: fret 3 on string 1, then fret 5 on string 2. Bars 2 and 3 hold one note each. */
const SONG = makeSong([
  [
    beat(toTux(header(1).start), [note(1, 3)]),
    beat(toTux(header(1).start) + 960, [note(2, 5)]),
  ],
  [beat(toTux(header(2).start), [note(3, 7)])],
  [beat(toTux(header(3).start), [note(4, 9)])],
]);

function rowProps(
  song: Song,
  mode: ScoreMode,
  onPress: (hit: RowHit, isExtending: boolean) => void,
): ScoreRowProps {
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
    zoom: 1,
    rowIndex: 0,
    onPress,
    onDrag: () => undefined,
  };
}

interface RenderedRow {
  readonly props: ScoreRowProps;
  readonly onPress: jest.Mock<void, [RowHit, boolean]>;
  readonly canvas: () => {
    readonly commands: readonly DrawCommand[];
    readonly style: unknown;
  };
  readonly pressAt: (x: number, y: number) => void;
  readonly canvasNode: () => ReactTestRenderer.ReactTestInstance;
  readonly update: (next: ScoreRowProps) => void;
}

function render(
  mode: ScoreMode = 'notationAndTab',
  song: Song = SONG,
  zoom = 1,
): RenderedRow {
  const onPress = jest.fn<void, [RowHit, boolean]>();
  const props = { ...rowProps(song, mode, onPress), zoom };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ScoreRow {...props} />);
  });
  const canvas = () => renderer.root.findByType(ScoreCanvas);
  return {
    props,
    onPress,
    canvas: () => ({
      commands: canvas().props.commands,
      style: canvas().props.style,
    }),
    canvasNode: canvas,
    pressAt: (x, y) =>
      ReactTestRenderer.act(() =>
        pressHandler(canvas())({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y } }),
      ),
    update: next =>
      ReactTestRenderer.act(() => renderer.update(<ScoreRow {...next} />)),
  };
}

/** The handler the mouse going down on the canvas reaches: the nearest enclosing `onPressIn` (the row's Pressable). */
function pressHandler(
  canvas: ReactTestRenderer.ReactTestInstance,
): (event: unknown) => void {
  for (
    let node: ReactTestRenderer.ReactTestInstance | null = canvas;
    node !== null;
    node = node.parent
  ) {
    if (typeof node.props.onPressIn === 'function') {
      return node.props.onPressIn;
    }
  }
  throw new Error('Nothing around the canvas handles presses');
}

/** The row's Pressable: the nearest node around the canvas with press handlers. */
function pressableOf(canvas: ReactTestRenderer.ReactTestInstance): ReactTestRenderer.ReactTestInstance {
  for (let node: ReactTestRenderer.ReactTestInstance | null = canvas; node !== null; node = node.parent) {
    if (typeof node.props.onPressMove === 'function') {
      return node;
    }
  }
  throw new Error('Nothing around the canvas follows drags');
}

/** Centre of beat `beatIndex` of the row's first bar, on the tab line of `string`. */
function tabPoint(
  props: ScoreRowProps,
  beatIndex: number,
  string: number,
): { readonly x: number; readonly y: number } {
  const [first] = placeRow(props.row, props.headerWidth);
  const beatX = first?.layout.beats[beatIndex]?.x ?? Number.NaN;
  const tabTop = props.geometry.tabTop ?? Number.NaN;
  return {
    x: (first?.x ?? Number.NaN) + beatX,
    y: tabTop + (string - 1) * TAB.stringGap,
  };
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
    expect(style).toEqual({
      width: ROW_WIDTH,
      height: row.props.geometry.height,
    });
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
    const edited: Song = {
      ...SONG,
      tracks: [
        {
          ...track,
          measures: [
            track.measures[0]!,
            track.measures[1]!,
            { ...track.measures[2]!, beats: [] },
          ],
        },
      ],
    };

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
    row.update({
      ...row.props,
      song: onStrings(SONG, [64, 59, 55, 50, 45, 38]),
    });

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
    expect(row.onPress).toHaveBeenCalledWith({
      measureIndex: 0,
      beatIndex: 1,
      string: 2,
      trackIndex: 0,
    }, false);
  });

  it('picks the beat but no string for a press on the notation staff', () => {
    // Arrange
    const row = render();
    const { x } = tabPoint(row.props, 0, 1);

    // Act
    row.pressAt(x, row.props.geometry.notationTop ?? Number.NaN);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({
      measureIndex: 0,
      beatIndex: 0,
      string: undefined,
      trackIndex: 0,
    }, false);
  });

  it('ignores a press past the last bar of the row', () => {
    const row = render();
    row.pressAt(ROW_WIDTH - 1, tabPoint(row.props, 0, 1).y);
    expect(row.onPress).not.toHaveBeenCalled();
  });

  it('maps a press on a zoomed row back to the same note', () => {
    // Arrange: the row drawn at 150%
    const row = render('notationAndTab', SONG, 1.5);
    const { x, y } = tabPoint(row.props, 1, 2);

    // Act
    row.pressAt(x * 1.5, y * 1.5);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({
      measureIndex: 0,
      beatIndex: 1,
      string: 2,
      trackIndex: 0,
    }, false);
    expect(row.canvas().style).toEqual({
      width: ROW_WIDTH * 1.5,
      height: row.props.geometry.height * 1.5,
    });
  });

  it('says when shift was held, to grow the selection', () => {
    // Arrange
    const row = render();
    const { x, y } = tabPoint(row.props, 1, 2);

    // Act
    ReactTestRenderer.act(() => pressHandler(row.canvasNode())({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, shiftKey: true } }));

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({ measureIndex: 0, beatIndex: 1, string: 2, trackIndex: 0 }, true);
  });

  it('follows a drag from where the mouse went down, in layout points, into the rows around it', () => {
    // Arrange: the row at 200%, the third of the score
    const onDrag = jest.fn();
    const row = render('notationAndTab', SONG, 2);
    row.update({ ...row.props, rowIndex: 2, onDrag });
    const pressable = pressableOf(row.canvasNode());

    // Act: down at (100, 40) on screen (page 500, 300), then the pointer 60 right and 300 down
    ReactTestRenderer.act(() => pressable.props.onPressIn({ nativeEvent: { locationX: 100, locationY: 40, pageX: 500, pageY: 300 } }));
    ReactTestRenderer.act(() => pressable.props.onPressMove({ nativeEvent: { locationX: 0, locationY: 0, pageX: 560, pageY: 600 } }));

    // Assert
    expect(onDrag).toHaveBeenCalledWith(2, 80, 170, 0);
  });

  it('finds the string on a bass track in tab-only mode', () => {
    // Arrange: four strings, the press on string 4
    const bass = onStrings(SONG, [43, 38, 33, 28]);
    const row = render('tab', bass);
    const { x, y } = tabPoint(row.props, 0, 4);

    // Act
    row.pressAt(x, y);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({
      measureIndex: 0,
      beatIndex: 0,
      string: 4,
      trackIndex: 0,
    }, false);
  });
});

describe('ScoreRow as a staff of a multitrack system', () => {
  const DECOR = { namesWidth: 90, label: 'Lead', isFirstStaff: false, isLastStaff: true, height: 400 };

  it('draws the track’s label and its row without the heading, on a canvas as tall as the decor says', () => {
    // Arrange
    const row = render();

    // Act
    row.update({ ...row.props, trackIndex: 0, decor: DECOR, hasHeading: false });

    // Assert
    expect(textValues(row.canvas().commands)).toContain('Lead');
    expect(textValues(row.canvas().commands)).not.toContain('1');
    expect(row.canvas().style).toEqual({ width: ROW_WIDTH, height: DECOR.height });
  });

  it('hits the beat under a press past the names column and names the staff’s track', () => {
    // Arrange
    const row = render();
    row.update({ ...row.props, decor: DECOR });
    const { x, y } = tabPoint(row.props, 1, 2);

    // Act
    row.pressAt(x + DECOR.namesWidth, y);

    // Assert
    expect(row.onPress).toHaveBeenCalledWith({ measureIndex: 0, beatIndex: 1, string: 2, trackIndex: 0 }, false);
  });
});
