import type { Bend } from '@gp-editor/core';
import { BEND_GRAPH, engraveBendGraph, engraveVibratoPreview } from '../src/score/bend-graph';
import { PALETTE } from '../test-support/score-helpers';

const FULL: Bend = { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }, { position: 12, value: 4 }] };

describe('engraveBendGraph', () => {
  it('draws the curve point to point over a grid, one dot per point', () => {
    // Act
    const commands = engraveBendGraph(FULL, 4, PALETTE);

    // Assert
    const curve = commands.filter((command) => command.kind === 'line' && command.color === PALETTE.chromeAccent);
    const dots = commands.filter((command) => command.kind === 'circle');
    expect(curve).toHaveLength(2);
    expect(dots).toHaveLength(3);
  });

  it('puts position 0 at the left, 12 at the right, the top value at the top', () => {
    // Act
    const commands = engraveBendGraph(FULL, 4, PALETTE);

    // Assert
    const dots = commands.flatMap((command) => (command.kind === 'circle' ? [command] : []));
    expect(dots[0]?.x).toBe(BEND_GRAPH.left);
    expect(dots[0]?.y).toBe(BEND_GRAPH.top + BEND_GRAPH.plotHeight);
    expect(dots[2]?.x).toBe(BEND_GRAPH.left + BEND_GRAPH.plotWidth);
    expect(dots[2]?.y).toBe(BEND_GRAPH.top);
  });

  it('labels the amount in tones and draws only the grid without a bend', () => {
    const labelled = engraveBendGraph(FULL, 4, PALETTE).flatMap((command) => (command.kind === 'text' ? [command.text] : []));
    expect(labelled).toContain('full');
    expect(engraveBendGraph(undefined, 4, PALETTE).some((command) => command.kind === 'circle')).toBe(false);
  });
});

describe('engraveVibratoPreview', () => {
  it('draws a wider wave for wide vibrato and a flat line for none', () => {
    const height = (kind: 'none' | 'slight' | 'wide') => {
      const ys = engraveVibratoPreview(kind, PALETTE).flatMap((command) => (command.kind === 'line' ? [command.y1, command.y2] : []));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height('none')).toBe(0);
    expect(height('wide')).toBeGreaterThan(height('slight'));
  });
});
