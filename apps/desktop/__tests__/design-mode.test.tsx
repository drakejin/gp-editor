import ReactTestRenderer from 'react-test-renderer';
import { type Song, setBarWidthScale, setBeatOffset, stylesheetOf } from '@gp-editor/core';
import { SystemDesignButtons } from '../src/components/SystemDesignButtons';
import { type DesignDrag, useDesignDrag } from '../src/hooks/use-design-drag';
import { type DesignDragStart, SNAP_DISTANCE, designDragStep } from '../src/lib/design-drag';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import { DESIGN_HANDLE, type DesignHandle, designHandles, engraveDesign, hitTestDesign } from '../src/score/design-handles';
import { ROW } from '../src/score/geometry';
import { placeRow } from '../src/score/row';
import { type ScoreLayout, layoutScore } from '../src/score/score-layout';
import type { LayoutAction } from '../src/state/layout-edits';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const WIDTH = 900;
const QUARTER_TICKS = 960;

function songOfBars(count: number): Song {
  return makeSong(Array.from({ length: count }, (_, i) => Array.from({ length: 4 }, (__, b) => beat(toTux(header(i + 1).start) + b * QUARTER_TICKS, [note(1, b)]))));
}

function layoutOf(song: Song): ScoreLayout {
  return layoutScore(song, [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH);
}

/** The handles of system `systemIndex`'s canvas. */
function handlesOf(song: Song, layout: ScoreLayout, systemIndex = 0): DesignHandle[] {
  const system = layout.systems[systemIndex]!;
  const staff = layout.staves[0]!;
  return designHandles({
    song, trackIndex: 0, row: system.rows[0]!, barsX: system.headerWidth, namesWidth: 0, geometry: staff.geometry, height: staff.height,
    isTop: true, isLast: true, headingHeight: ROW.heading,
  });
}

function startOf(song: Song, layout: ScoreLayout, handle: DesignHandle, systemIndex = 0): DesignDragStart {
  return { handle, systemIndex, pointerX: handle.x, pointerY: handle.y, song, layout, rowWidth: WIDTH };
}

describe('designHandles', () => {
  it('puts a dot over each beat and a triangle over each bar line but the system’s last, and grips in the spaces', () => {
    // Arrange
    const song = songOfBars(8);
    const layout = layoutOf(song);
    const bars = layout.systems[0]!.rows[0]!.measures.length;

    // Act
    const handles = handlesOf(song, layout);

    // Assert
    expect(handles.filter((handle) => handle.kind === 'beat')).toHaveLength(bars * 4);
    expect(handles.filter((handle) => handle.kind === 'barline')).toHaveLength(bars - 1);
    expect(handles.flatMap((handle) => (handle.kind === 'spacing' ? [handle.spacing] : []))).toEqual(['staffSpacing', 'systemSpacing']);
    expect(handles.every((handle) => !handle.isMoved)).toBe(true);
  });

  it('marks moved beats and widened bars, drawn in the danger colour with the guideline', () => {
    // Arrange
    const song = setBarWidthScale(setBeatOffset(songOfBars(8), 0, 0, 3), 0, 1.4);
    const handles = handlesOf(song, layoutOf(song));

    // Act
    const palette = { ...PALETTE, accent: '#00AA00' };
    const commands = engraveDesign(handles, palette, 200, 123);

    // Assert
    expect(handles.filter((handle) => handle.isMoved).map((handle) => handle.kind)).toEqual(['beat', 'barline']);
    expect(commands[0]).toMatchObject({ kind: 'line', x1: 123, x2: 123, y1: 0, y2: 200, color: DESIGN_HANDLE.guideColor });
    expect(commands.filter((command) => 'color' in command && command.color === PALETTE.danger)).toHaveLength(2);
  });

  it('hit-tests the nearest handle near a press, and none far away', () => {
    // Arrange
    const song = songOfBars(4);
    const handles = handlesOf(song, layoutOf(song));
    const beatHandle = handles.find((handle) => handle.kind === 'beat')!;

    // Act / Assert
    expect(hitTestDesign(handles, beatHandle.x + 2, beatHandle.y + 1)).toBe(beatHandle);
    expect(hitTestDesign(handles, beatHandle.x, beatHandle.y + 40)).toBeUndefined();
  });
});

describe('designDragStep', () => {
  const song = songOfBars(16);
  const layout = layoutOf(song);
  const handles = handlesOf(song, layout);
  const secondBeat = handles.filter((handle) => handle.kind === 'beat')[1]!;

  it('moves a beat by the pointer, kept between its neighbours', () => {
    // Act
    const step = designDragStep(startOf(song, layout, secondBeat), secondBeat.x + 4, secondBeat.y);
    const far = designDragStep(startOf(song, layout, secondBeat), secondBeat.x + 400, secondBeat.y);

    // Assert
    expect(step.action).toEqual({ type: 'setBeatOffset', measureIndex: 0, at: secondBeat.kind === 'beat' ? secondBeat.at : -1, offset: 4 });
    const offset = far.action?.type === 'setBeatOffset' ? far.action.offset : 0;
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(60);
  });

  it('snaps a beat to a beat of the system below, with the guideline through both systems', () => {
    // Arrange: a beat of system 2 a little right of the dragged beat
    const below = placeRow(layout.systems[1]!.rows[0]!, layout.systems[1]!.headerWidth).flatMap((measure) => measure.layout.beats.map((placed) => measure.x + placed.x));
    const target = below.find((x) => x > secondBeat.x + 1 && x < secondBeat.x + 30)!;

    // Act
    const step = designDragStep(startOf(song, layout, secondBeat), target - SNAP_DISTANCE / 2, secondBeat.y);

    // Assert
    expect(step.guide).toEqual({ x: target, systemIndexes: [0, 1] });
    expect(step.action?.type === 'setBeatOffset' ? step.action.offset : undefined).toBeCloseTo(target - secondBeat.x, 0);
  });

  it('widens the bar left of a dragged bar line so that its right edge follows the pointer', () => {
    // Arrange
    const line = handles.find((handle) => handle.kind === 'barline')!;

    // Act
    const step = designDragStep(startOf(song, layout, line), line.x + 30, line.y);
    const widened = step.action?.type === 'setBarWidthScale' ? setBarWidthScale(song, 0, step.action.widthScale) : song;
    const first = layoutOf(widened).systems[0]!.rows[0]!.measures[0]!;

    // Assert
    expect(step.action?.type).toBe('setBarWidthScale');
    expect(layout.systems[0]!.headerWidth + first.width).toBeCloseTo(line.x + 30, 0);
  });

  it('changes the space under the systems by the pointer’s rise or fall', () => {
    // Arrange
    const grip = handles.find((handle) => handle.kind === 'spacing' && handle.spacing === 'systemSpacing')!;

    // Act
    const step = designDragStep(startOf(song, layout, grip), grip.x, grip.y + 15.4);
    const up = designDragStep(startOf(song, layout, grip), grip.x, grip.y - 50);

    // Assert
    expect(step.action?.type === 'setStylesheet' ? step.action.stylesheet.systems.systemSpacing : undefined).toBe(15);
    expect(up.action?.type === 'setStylesheet' ? up.action.stylesheet.systems.systemSpacing : undefined).toBe(0);
  });
});

describe('useDesignDrag', () => {
  function renderDrag(song: Song, onEdit: (action: LayoutAction) => void): () => DesignDrag {
    let drag: DesignDrag | undefined;
    function Probe() {
      drag = useDesignDrag(song, onEdit);
      return null;
    }
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<Probe />);
    });
    return () => drag!;
  }

  it('shows the drag on the song while it lasts and makes it one edit when let go', () => {
    // Arrange
    const song = songOfBars(4);
    const layout = layoutOf(song);
    const grip = handlesOf(song, layout).find((handle) => handle.kind === 'spacing' && handle.spacing === 'systemSpacing')!;
    const edits: LayoutAction[] = [];
    const current = renderDrag(song, (action) => edits.push(action));

    // Act
    ReactTestRenderer.act(() => current().onPress(startOf(song, layout, grip)));
    ReactTestRenderer.act(() => current().onMove(grip.x, grip.y + 10));
    ReactTestRenderer.act(() => current().onMove(grip.x, grip.y + 20));
    const previewed = stylesheetOf(current().song).systems.systemSpacing;
    ReactTestRenderer.act(() => current().onRelease());

    // Assert
    expect(previewed).toBe(20);
    expect(edits).toHaveLength(1);
    expect(current().song).toBe(song);
  });

  it('makes no edit for a press let go without a move', () => {
    const song = songOfBars(2);
    const layout = layoutOf(song);
    const edits: LayoutAction[] = [];
    const current = renderDrag(song, (action) => edits.push(action));
    ReactTestRenderer.act(() => current().onPress(startOf(song, layout, handlesOf(song, layout)[0]!)));
    ReactTestRenderer.act(() => current().onRelease());
    expect(edits).toEqual([]);
  });
});

describe('SystemDesignButtons', () => {
  it('takes a bar in (+), gives one away (−) and resets the system (×), each enabled when it can act', () => {
    // Arrange: a system of bars 3–4 in six bars, bar 4 widened
    const song = setBarWidthScale(songOfBars(6), 3, 1.5);
    const edits: LayoutAction[] = [];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<SystemDesignButtons palette={PALETTE} song={song} firstMeasureIndex={2} barCount={2} onEdit={(action) => edits.push(action)} />);
    });
    const tooltips = new Set<string>();
    const buttons = renderer.root.findAll((node) => typeof node.props.onPress === 'function' && typeof node.props.tooltip === 'string').filter((node) => {
      const isNew = !tooltips.has(node.props.tooltip as string);
      tooltips.add(node.props.tooltip as string);
      return isNew;
    });

    // Act
    buttons.forEach((button) => ReactTestRenderer.act(() => button.props.onPress()));

    // Assert
    expect(buttons.map((button) => button.props.accessibilityState?.disabled === true)).toEqual([false, false, false]);
    expect(edits).toEqual([
      { type: 'setSystemSize', measureIndex: 2, bars: 3 },
      { type: 'setSystemSize', measureIndex: 2, bars: 1 },
      { type: 'resetPositions', measureIndexes: [2, 3] },
    ]);
  });
});

describe('SystemDesignButtons at the end of the song', () => {
  it('cannot take a bar in after the last bar, nor reset a system laid out as it is', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<SystemDesignButtons palette={PALETTE} song={songOfBars(6)} firstMeasureIndex={4} barCount={2} onEdit={() => undefined} />);
    });
    const states = renderer.root.findAll((node) => typeof node.props.tooltip === 'string' && node.props.accessibilityState !== undefined).map((node) => [node.props.tooltip as string, node.props.accessibilityState?.disabled === true]);
    expect(Object.fromEntries(states)).toEqual({ 'One more bar in this system': true, 'One bar less in this system': false, 'Reset this system: bar widths, beat positions and bars as laid out': true });
  });
});
