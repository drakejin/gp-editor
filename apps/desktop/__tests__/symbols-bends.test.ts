import type { BendPoint } from '@gp-editor/core';
import type {
  CurveCommand,
  DrawCommand,
  PolygonCommand,
  TextCommand,
} from '../src/score/draw';
import { type BendPlacement, bendArrows, hasBends } from '../src/score/symbols/bends';
import { beat, makeSong, note } from '../test-support/songs';

const PLACEMENT: BendPlacement = {
  startX: 20,
  endX: 68,
  baseY: 40,
  tipY: 10,
  color: '#ABCDEF',
};

const points = (...pairs: Array<[number, number]>): BendPoint[] =>
  pairs.map(([position, value]) => ({ position, value }));

function ofKind<K extends DrawCommand['kind']>(
  commands: readonly DrawCommand[],
  kind: K,
): Extract<DrawCommand, { kind: K }>[] {
  return commands.filter(
    (c): c is Extract<DrawCommand, { kind: K }> => c.kind === kind,
  );
}

/** Direction of an arrowhead: its tip is the first point, its base the next two. */
function pointsUp(head: PolygonCommand): boolean {
  return (head.points[3] ?? 0) > (head.points[1] ?? 0);
}

describe('bendArrows', () => {
  it('curves up from the fret number to an arrowhead above the staff with the amount over it', () => {
    // Act
    const commands = bendArrows(points([0, 0], [6, 4], [12, 4]), PLACEMENT);

    // Assert
    const [curve] = ofKind(commands, 'curve');
    const [head] = ofKind(commands, 'polygon');
    const [label] = ofKind(commands, 'text');
    expect(curve).toMatchObject({ x1: 20, y1: 40 });
    expect((curve as CurveCommand).x2).toBe(44);
    expect(head!.points.slice(0, 2)).toEqual([44, 10]);
    expect(pointsUp(head!)).toBe(true);
    expect(label).toMatchObject({
      text: 'full',
      x: 44,
      align: 'center',
      font: 'ui',
    });
    expect((label as TextCommand).y).toBeLessThan(10);
  });

  it('draws the hold after the bend as a dashed line at the top', () => {
    const commands = bendArrows(points([0, 0], [6, 4], [12, 4]), PLACEMENT);
    const hold = ofKind(commands, 'line').find(line => line.dash !== undefined);
    expect(hold).toMatchObject({ x1: 44, x2: 68, y1: 10, y2: 10 });
  });

  it('releases with a downward arrow back to the string and no second label', () => {
    // Act
    const commands = bendArrows(
      points([0, 0], [3, 2], [6, 2], [9, 0], [12, 0]),
      PLACEMENT,
    );

    // Assert
    const heads = ofKind(commands, 'polygon');
    expect(heads.map(pointsUp)).toEqual([true, false]);
    expect(heads[1]!.points[1]).toBeGreaterThan(10);
    expect(heads[1]!.points[1]).toBeLessThan(40);
    expect(ofKind(commands, 'text').map(t => t.text)).toEqual(['½']);
  });

  it('draws a pre-bend as a straight arrow up from the fret number', () => {
    // Act
    const commands = bendArrows(points([0, 4], [12, 4]), PLACEMENT);

    // Assert
    const shaft = ofKind(commands, 'line').find(line => line.x1 === line.x2);
    expect(shaft).toMatchObject({ x1: 20 });
    expect(ofKind(commands, 'polygon')[0]!.points.slice(0, 2)).toEqual([
      20, 10,
    ]);
    expect(ofKind(commands, 'text').map(t => t.text)).toEqual(['full']);
  });

  it('releases a pre-bend downwards', () => {
    const commands = bendArrows(points([0, 4], [6, 0], [12, 0]), PLACEMENT);
    expect(ofKind(commands, 'polygon').map(pointsUp)).toEqual([true, false]);
  });

  it('stacks a second, higher bend above the first', () => {
    const commands = bendArrows(points([0, 0], [4, 2], [8, 4]), PLACEMENT);
    const tips = ofKind(commands, 'polygon').map(head => head.points[1] ?? 0);
    expect(tips[1]).toBeLessThan(tips[0]!);
    expect(ofKind(commands, 'text').map(t => t.text)).toEqual(['½', 'full']);
  });

  it('draws nothing for a bend that never leaves the string and colours everything it draws', () => {
    expect(bendArrows(points([0, 0], [12, 0]), PLACEMENT)).toEqual([]);
    expect(bendArrows([], PLACEMENT)).toEqual([]);
    const commands = bendArrows(points([0, 0], [12, 6]), PLACEMENT);
    expect(
      commands.every(c => 'color' in c && c.color === PLACEMENT.color),
    ).toBe(true);
  });

  it('keeps a minimum width when the note is very short', () => {
    const commands = bendArrows(points([0, 0], [12, 4]), {
      ...PLACEMENT,
      endX: 21,
    });
    expect(ofKind(commands, 'polygon')[0]!.points[0]).toBeGreaterThanOrEqual(
      28,
    );
  });
});

describe('custom bends', () => {
  it('labels only the highest amount of a bend with many amounts', () => {
    const commands = bendArrows(
      points([0, 0], [3, 2], [6, 4], [9, 6], [12, 8]),
      PLACEMENT,
    );
    expect(ofKind(commands, 'text').map(t => t.text)).toEqual(['2']);
    expect(ofKind(commands, 'polygon')).toHaveLength(4);
  });
});

describe('hasBends', () => {
  it('finds a bent note in any bar of the track', () => {
    // Arrange
    const bend = { points: points([0, 0], [6, 4], [12, 4]) };
    const song = makeSong([[beat(960, [note(1, 5)])], [beat(4800, [note(3, 7, { bend })])]]);

    // Act + Assert
    expect(hasBends(song.tracks[0]!.measures)).toBe(true);
  });

  it('is false when no note bends', () => {
    const song = makeSong([[beat(960, [note(1, 5)])]]);
    expect(hasBends(song.tracks[0]!.measures)).toBe(false);
  });
});
