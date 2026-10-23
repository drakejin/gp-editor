import { SCALE_ROOTS, scaleIndexNamed } from '@gp-editor/core';
import { SCALE_COLORS, scaleHighlight, scaleMarkColor } from '../src/score/scale-marks';

const A_MINOR_PENTATONIC = { rootIndex: SCALE_ROOTS.findIndex((root) => root.name === 'A'), scaleIndex: scaleIndexNamed('Pentatonic Minor Scale') ?? -1 };

describe('scaleHighlight', () => {
  it('gives the chosen scale’s pitch classes and its root', () => {
    expect(scaleHighlight(A_MINOR_PENTATONIC)).toEqual({ pitchClasses: [9, 0, 2, 4, 7], root: 9 });
  });

  it('has nothing to light without a scale', () => {
    expect(scaleHighlight(undefined)).toBeUndefined();
    expect(scaleHighlight({ rootIndex: 0, scaleIndex: -1 })).toBeUndefined();
  });
});

describe('scaleMarkColor', () => {
  it('colours the root apart from the other notes of the scale, in any octave', () => {
    // Arrange
    const highlight = scaleHighlight(A_MINOR_PENTATONIC);

    // Act + Assert
    expect(scaleMarkColor(45, highlight)).toBe(SCALE_COLORS.root);
    expect(scaleMarkColor(81, highlight)).toBe(SCALE_COLORS.root);
    expect(scaleMarkColor(48, highlight)).toBe(SCALE_COLORS.note);
    expect(scaleMarkColor(46, highlight)).toBeUndefined();
    expect(scaleMarkColor(45, undefined)).toBeUndefined();
  });
});
