import {
  arrowhead,
  bowCurve,
  dashedSpan,
  halfArc,
  textWidth,
  verticalArrow,
  wavyLine,
} from '../src/score/symbols/shapes';
import { TECHNIQUE_GLYPHS } from '../src/score/symbols/smufl';

const INK = '#123456';

describe('arrowhead', () => {
  it('puts the tip at the point and the base below it for an upward arrow', () => {
    // Act
    const head = arrowhead(10, 20, 'up', 4, INK);

    // Assert
    expect(head).toEqual({
      kind: 'polygon',
      points: [10, 20, 12, 24, 8, 24],
      color: INK,
    });
  });

  it('puts the base above the tip for a downward arrow', () => {
    expect(arrowhead(10, 20, 'down', 4, INK).points).toEqual([
      10, 20, 8, 16, 12, 16,
    ]);
  });
});

describe('verticalArrow', () => {
  it('draws a shaft that stops at the arrowhead and a head at the end', () => {
    // Act
    const [shaft, head] = verticalArrow(5, 40, 10, 1, INK);

    // Assert
    expect(shaft).toMatchObject({
      kind: 'line',
      x1: 5,
      y1: 40,
      x2: 5,
      color: INK,
    });
    expect(shaft?.kind === 'line' && shaft.y2).toBeGreaterThan(10);
    expect(head).toMatchObject({
      kind: 'polygon',
      points: expect.arrayContaining([5, 10]),
    });
  });

  it('points down when the end is below the start', () => {
    const [, head] = verticalArrow(5, 10, 40, 1, INK);
    expect(head?.kind === 'polygon' && head.points.slice(0, 2)).toEqual([
      5, 40,
    ]);
    expect(head?.kind === 'polygon' && head.points[3]).toBeLessThan(40);
  });
});

describe('wavyLine', () => {
  it('repeats the glyph as often as it fits between the two ends in one text command', () => {
    // Act
    const [wave] = wavyLine(
      0,
      20,
      30,
      TECHNIQUE_GLYPHS.guitarVibratoStroke,
      32,
      INK,
    );

    // Assert: the glyph advances 0.608 staff spaces (4.864 points at size 32)
    expect(wave).toMatchObject({
      kind: 'text',
      x: 0,
      y: 30,
      size: 32,
      font: 'music',
      align: 'left',
      color: INK,
    });
    expect(wave?.text).toBe(
      TECHNIQUE_GLYPHS.guitarVibratoStroke.text.repeat(4),
    );
  });

  it('draws nothing when not even one glyph fits', () => {
    expect(
      wavyLine(0, 3, 30, TECHNIQUE_GLYPHS.guitarVibratoStroke, 32, INK),
    ).toEqual([]);
    expect(wavyLine(10, 0, 30, TECHNIQUE_GLYPHS.wiggleTrill, 32, INK)).toEqual(
      [],
    );
  });
});

describe('curves', () => {
  it('bows a curve between two points by the given amount at its middle', () => {
    const curve = bowCurve(0, 10, 20, 30, -5, 1, INK);
    // A quadratic Bézier reaches half-way to its control point, so the control is twice the bulge away.
    expect(curve).toEqual({
      kind: 'curve',
      x1: 0,
      y1: 10,
      cx: 10,
      cy: 10,
      x2: 20,
      y2: 30,
      width: 1,
      color: INK,
    });
  });

  it('ends a half arc level at its crest so two halves join into one arc', () => {
    // Act
    const outgoing = halfArc(10, 50, 20, -6, 1, INK);
    const incoming = halfArc(30, 0, 20, -6, 1, INK);

    // Assert
    expect(outgoing).toEqual({
      kind: 'curve',
      x1: 10,
      y1: 20,
      cx: 30,
      cy: 14,
      x2: 50,
      y2: 14,
      width: 1,
      color: INK,
    });
    expect(incoming).toMatchObject({ x1: 30, y1: 20, x2: 0, y2: 14, cy: 14 });
  });
});

describe('dashedSpan', () => {
  it('draws a dashed line and a hook down at the end', () => {
    // Act
    const [dashes, hook] = dashedSpan(10, 60, 5, { hook: 4, color: INK });

    // Assert
    expect(dashes).toMatchObject({
      kind: 'line',
      x1: 10,
      y1: 5,
      x2: 60,
      y2: 5,
      color: INK,
    });
    expect(dashes?.kind === 'line' && dashes.dash).toEqual([3, 2]);
    expect(hook).toMatchObject({ kind: 'line', x1: 60, y1: 5, x2: 60, y2: 9 });
  });

  it('leaves the hook off a span that goes on and draws nothing too short to see', () => {
    expect(dashedSpan(10, 60, 5, { color: INK })).toHaveLength(1);
    expect(dashedSpan(10, 11, 5, { hook: 4, color: INK })).toEqual([]);
  });
});

describe('textWidth', () => {
  it('estimates the advance of a label from its length and size', () => {
    expect(textWidth('P.M.', 10)).toBeCloseTo(22.4);
    expect(textWidth('', 10)).toBe(0);
  });
});
