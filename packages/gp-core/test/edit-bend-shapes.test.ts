import { describe, expect, it } from 'vitest';
import { BEND_SHAPES, type BendShape, bendShapeOf, buildBend } from '../src/edit/bend-shapes';
import { BEND_PRESETS } from '../src/edit/effects';
import type { Bend } from '../src/model/song';

const AMOUNTS = Array.from({ length: 12 }, (_, i) => i + 1);

function curve(...points: readonly (readonly [number, number])[]): Bend {
  return { points: points.map(([position, value]) => ({ position, value })) };
}

describe('buildBend', () => {
  it.each([
    ['bend', curve([0, 0], [6, 3], [12, 3])],
    ['bendRelease', curve([0, 0], [3, 3], [6, 3], [9, 0], [12, 0])],
    ['bendReleaseBend', curve([0, 0], [2, 3], [4, 3], [6, 0], [8, 0], [10, 3], [12, 3])],
    ['preBend', curve([0, 3], [12, 3])],
    ['preBendRelease', curve([0, 3], [4, 3], [8, 0], [12, 0])],
    ['release', curve([0, 3], [6, 0], [12, 0])],
  ] as const)('draws a %s of three quarter tones', (shape, expected) => {
    // Act
    const bend = buildBend(shape, 3);

    // Assert
    expect(bend).toEqual(expected);
  });

  it('rounds the amount and keeps it between a quarter tone and three tones', () => {
    // Act
    const amounts = [2.4, 0, -5, 40, Number.POSITIVE_INFINITY, Number.NaN].map((amount) => buildBend('preBend', amount).points[0]?.value);

    // Assert
    expect(amounts).toEqual([2, 1, 1, 12, 12, 1]);
  });

  it('makes the presets TuxGuitar’s bend dialog offers (and the half-tone bend)', () => {
    // Assert
    expect(BEND_PRESETS).toEqual({
      half: buildBend('bend', 2),
      full: buildBend('bend', 4),
      bendRelease: buildBend('bendRelease', 4),
      bendReleaseBend: buildBend('bendReleaseBend', 4),
      preBend: buildBend('preBend', 4),
      preBendRelease: buildBend('preBendRelease', 4),
    });
  });
});

describe('bendShapeOf', () => {
  it('recognises every bend buildBend makes, with its amount', () => {
    // Arrange
    const built = BEND_SHAPES.flatMap((shape) => AMOUNTS.map((amount) => ({ shape, amount, bend: buildBend(shape, amount) })));

    // Act
    const recognised = built.map(({ bend }) => bendShapeOf(bend));

    // Assert
    expect(recognised).toEqual(built.map(({ shape, amount }) => ({ shape, amount })));
  });

  it('tells release from a pre-bend and release of the same amount', () => {
    // Act
    const shapes = (['release', 'preBendRelease'] as const).map((shape) => bendShapeOf(buildBend(shape, 4))?.shape);

    // Assert
    expect(shapes).toEqual<BendShape[]>(['release', 'preBendRelease']);
  });

  it.each([
    ['a curve of its own', curve([0, 0], [4, 2], [8, 6], [12, 6])],
    ['a bend that holds no bend', curve([0, 0], [6, 0], [12, 0])],
    ['a bend with no points', curve()],
    ['a bend of two amounts', curve([0, 0], [2, 4], [4, 4], [6, 0], [8, 0], [10, 2], [12, 2])],
    ['a bend past three tones', curve([0, 0], [6, 16], [12, 16])],
    ['a preset shape off the grid', curve([0, 0], [5, 4], [12, 4])],
  ])('does not recognise %s', (_name, bend) => {
    // Act
    const shape = bendShapeOf(bend);

    // Assert
    expect(shape).toBeUndefined();
  });
});
