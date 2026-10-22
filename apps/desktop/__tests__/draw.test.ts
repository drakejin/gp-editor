import { type DrawCommand, scaleCommands } from '../src/score/draw';

describe('scaleCommands', () => {
  it('scales positions, sizes and stroke widths of every kind of command', () => {
    // Arrange
    const commands: DrawCommand[] = [
      { kind: 'line', x1: 10, y1: 20, x2: 30, y2: 40, width: 2, color: '#000000', dash: [4, 2] },
      { kind: 'rect', x: 10, y: 20, width: 30, height: 40, color: '#000000', radius: 4 },
      { kind: 'circle', x: 10, y: 20, radius: 6, color: '#000000', strokeWidth: 2 },
      { kind: 'text', x: 10, y: 20, text: 'A', size: 12, color: '#000000', font: 'ui', align: 'left', bold: true },
      { kind: 'curve', x1: 10, y1: 20, cx: 30, cy: 40, x2: 50, y2: 60, width: 2, color: '#000000' },
      { kind: 'polygon', points: [10, 20, 30, 40], color: '#000000' },
    ];

    // Act
    const scaled = scaleCommands(commands, 0.5);

    // Assert
    expect(scaled).toEqual([
      { kind: 'line', x1: 5, y1: 10, x2: 15, y2: 20, width: 1, color: '#000000', dash: [2, 1] },
      { kind: 'rect', x: 5, y: 10, width: 15, height: 20, color: '#000000', radius: 2 },
      { kind: 'circle', x: 5, y: 10, radius: 3, color: '#000000', strokeWidth: 1 },
      { kind: 'text', x: 5, y: 10, text: 'A', size: 6, color: '#000000', font: 'ui', align: 'left', bold: true },
      { kind: 'curve', x1: 5, y1: 10, cx: 15, cy: 20, x2: 25, y2: 30, width: 1, color: '#000000' },
      { kind: 'polygon', points: [5, 10, 15, 20], color: '#000000' },
    ]);
  });

  it('adds no optional fields a command did not have', () => {
    const [line, rect, circle] = scaleCommands(
      [
        { kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, width: 1, color: '#000000' },
        { kind: 'rect', x: 0, y: 0, width: 1, height: 1, color: '#000000' },
        { kind: 'circle', x: 0, y: 0, radius: 1, color: '#000000' },
      ],
      2,
    );
    expect(line).not.toHaveProperty('dash');
    expect(rect).not.toHaveProperty('radius');
    expect(circle).not.toHaveProperty('strokeWidth');
  });
});
