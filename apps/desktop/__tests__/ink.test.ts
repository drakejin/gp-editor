import type { DrawCommand } from '../src/score/draw';
import { inkBottom, inkSpan } from '../src/score/ink';

const COLOR = '#000000';

describe('inkSpan', () => {
  it('measures lines, rectangles, circles and polygons exactly', () => {
    // Arrange
    const commands: DrawCommand[] = [
      { kind: 'line', x1: 10, y1: 5, x2: 4, y2: 20, width: 2, color: COLOR },
      { kind: 'rect', x: 1, y: 2, width: 3, height: 4, color: COLOR },
      { kind: 'circle', x: 10, y: 10, radius: 2, color: COLOR },
      { kind: 'polygon', points: [0, 0, 8, 3, 4, 9], color: COLOR },
    ];

    // Act
    const spans = commands.map(inkSpan);

    // Assert
    expect(spans).toEqual([
      { left: 4, right: 10, bottom: 21 },
      { left: 1, right: 4, bottom: 6 },
      { left: 8, right: 12, bottom: 12 },
      { left: 0, right: 8, bottom: 9 },
    ]);
  });

  it('takes a tie down to half way towards its control point', () => {
    // Act
    const span = inkSpan({ kind: 'curve', x1: 0, y1: 10, cx: 10, cy: 30, x2: 20, y2: 10, width: 0, color: COLOR });

    // Assert
    expect(span).toEqual({ left: 0, right: 20, bottom: 20 });
  });

  it('gives a music glyph room below its baseline and either side, and centres ui text on its y', () => {
    // Act
    const glyph = inkSpan({ kind: 'text', x: 100, y: 50, text: 'x', size: 32, color: COLOR, font: 'music', align: 'center' });
    const label = inkSpan({ kind: 'text', x: 100, y: 50, text: '8vb', size: 10, color: COLOR, font: 'ui', align: 'left' });

    // Assert
    expect(glyph.bottom).toBe(58);
    expect(glyph.left).toBeLessThan(100);
    expect(glyph.right).toBeGreaterThan(100);
    expect(label).toMatchObject({ left: 100, bottom: 55 });
    expect(label.right).toBeGreaterThan(110);
  });
});

describe('inkBottom', () => {
  it('is the lowest ink among the commands reaching into the columns', () => {
    // Arrange
    const commands: DrawCommand[] = [
      { kind: 'line', x1: 0, y1: 40, x2: 200, y2: 40, width: 0, color: COLOR },
      { kind: 'rect', x: 50, y: 0, width: 10, height: 70, color: COLOR },
      { kind: 'rect', x: 150, y: 0, width: 10, height: 90, color: COLOR },
    ];

    // Act + Assert
    expect(inkBottom(commands, 45, 65)).toBe(70);
    expect(inkBottom(commands, 90, 110)).toBe(40);
    expect(inkBottom(commands, 0, 200)).toBe(90);
    expect(inkBottom([], 0, 200)).toBeUndefined();
  });
});
