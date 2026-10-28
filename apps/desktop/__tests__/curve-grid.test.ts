import { TREMOLO_BAR_PRESETS, buildBend } from '@gp-editor/core';
import { draftFromCurve, pressDraft } from '../src/lib/curve-draft';
import type { DrawCommand } from '../src/score/draw';
import { CURVE_GRID, curvePointAt, curvePointXY, curveView, engraveCurveGrid, hitTestCurvePoint } from '../src/score/curve-grid';
import { PALETTE } from '../test-support/score-helpers';

const DIP = draftFromCurve('tremoloBar', TREMOLO_BAR_PRESETS.dip);
const { left, top, plotWidth, plotHeight } = CURVE_GRID;

function circles(commands: readonly DrawCommand[]) {
  return commands.flatMap((command) => (command.kind === 'circle' ? [command] : []));
}

function labels(commands: readonly DrawCommand[]): string[] {
  return commands.flatMap((command) => (command.kind === 'text' ? [command.text] : []));
}

describe('curveView', () => {
  it('shows a bend from the note up to three tones', () => {
    expect(curveView(draftFromCurve('bend', buildBend('bend', 4)))).toEqual({ min: 0, max: 12 });
  });

  it('shows the tremolo bar three tones either way, and an octave when the curve goes further', () => {
    expect(curveView(DIP)).toEqual({ min: -12, max: 12 });
    expect(curveView(draftFromCurve('tremoloBar', { points: [{ position: 0, value: 0 }, { position: 6, value: -13 }] }))).toEqual({ min: -24, max: 24 });
  });
});

describe('curvePointXY and curvePointAt', () => {
  it('puts position 0 at the left, 12 at the right, the view’s top value at the top', () => {
    // Arrange
    const view = curveView(DIP);

    // Act / Assert
    expect(curvePointXY({ position: 0, value: 12 }, view)).toEqual({ x: left, y: top });
    expect(curvePointXY({ position: 12, value: -12 }, view)).toEqual({ x: left + plotWidth, y: top + plotHeight });
    expect(curvePointXY({ position: 6, value: 0 }, view)).toEqual({ x: left + plotWidth / 2, y: top + plotHeight / 2 });
  });

  it('turns a point of the canvas back into a position and a value, kept inside the grid', () => {
    // Arrange
    const view = curveView(DIP);

    // Act
    const middle = curvePointAt(left + plotWidth / 2, top + plotHeight / 4, view);
    const outside = curvePointAt(left - 50, top + plotHeight + 80, view);

    // Assert
    expect(middle).toEqual({ position: 6, value: 6 });
    expect(outside).toEqual({ position: 0, value: -12 });
  });
});

describe('hitTestCurvePoint', () => {
  it('finds the point near the pointer, and nothing away from every point', () => {
    // Arrange
    const view = curveView(DIP);
    const dip = curvePointXY({ position: 6, value: -4 }, view);

    // Act / Assert
    expect(hitTestCurvePoint(DIP.points, dip.x + 4, dip.y - 5, view)).toBe(1);
    expect(hitTestCurvePoint(DIP.points, dip.x + 40, dip.y, view)).toBeUndefined();
  });
});

describe('engraveCurveGrid', () => {
  it('draws the curve point to point with a dot on each point, and rings the selected one', () => {
    // Act
    const plain = engraveCurveGrid(DIP, curveView(DIP), PALETTE);
    const selected = engraveCurveGrid(pressDraft(DIP, 1, { position: 6, value: -4 }), curveView(DIP), PALETTE);

    // Assert
    const curve = plain.filter((command) => command.kind === 'line' && command.color === PALETTE.chromeAccent);
    expect(curve).toHaveLength(2);
    expect(circles(plain).filter((circle) => circle.strokeWidth === undefined)).toHaveLength(3);
    expect(circles(selected).filter((circle) => circle.strokeWidth !== undefined)).toHaveLength(1);
  });

  it('labels the tone rows with their pitch: signed for the tremolo bar, as amounts for a bend', () => {
    expect(labels(engraveCurveGrid(DIP, curveView(DIP), PALETTE))).toEqual(['+3', '+2', '+1', '0', '−1', '−2', '−3']);
    const bend = draftFromCurve('bend', buildBend('bend', 4));
    expect(labels(engraveCurveGrid(bend, curveView(bend), PALETTE))).toEqual(['3', '2', 'full', '0']);
  });

  it('draws only the grid without points', () => {
    const empty = draftFromCurve('tremoloBar', undefined);
    expect(circles(engraveCurveGrid(empty, curveView(empty), PALETTE))).toEqual([]);
  });
});
