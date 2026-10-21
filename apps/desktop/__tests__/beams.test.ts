import { QUARTER_TIME } from '@gp-editor/core';
import { BEAM_STUB, beamGroupTicks, flagCount, layoutBeams, type RhythmBeat } from '../src/lib/beams';

const EIGHTH = QUARTER_TIME / 2;
const SIXTEENTH = QUARTER_TIME / 4;

function beats(...specs: Array<[start: number, value: number, isRest?: boolean]>): RhythmBeat[] {
  return specs.map(([start, value, isRest = false], i) => ({ x: 10 + i * 20, start, value, isRest }));
}

describe('layoutBeams', () => {
  it('beams eighths within each quarter and leaves quarters alone', () => {
    // Arrange
    const measure = beats([0, 8], [EIGHTH, 8], [QUARTER_TIME, 4], [2 * QUARTER_TIME, 8], [2 * QUARTER_TIME + EIGHTH, 8]);

    // Act
    const layout = layoutBeams(measure, 0, QUARTER_TIME);

    // Assert
    expect([...layout.beamed]).toEqual([0, 1, 3, 4]);
    expect(layout.beams).toEqual([
      { level: 1, fromX: 10, toX: 30 },
      { level: 1, fromX: 70, toX: 90 },
    ]);
  });

  it('joins sixteenth beams between sixteenths and stubs a lone one', () => {
    const dotted = beats([0, 8], [EIGHTH + SIXTEENTH, 16]);
    expect(layoutBeams(dotted, 0, QUARTER_TIME).beams).toEqual([
      { level: 1, fromX: 10, toX: 30 },
      { level: 2, fromX: 30 - BEAM_STUB, toX: 30 },
    ]);
    const run = beats([0, 16], [SIXTEENTH, 16], [EIGHTH, 8]);
    expect(layoutBeams(run, 0, QUARTER_TIME).beams).toEqual([
      { level: 1, fromX: 10, toX: 50 },
      { level: 2, fromX: 10, toX: 30 },
    ]);
    const leading = beats([0, 16], [SIXTEENTH, 8]);
    expect(layoutBeams(leading, 0, QUARTER_TIME).beams).toContainEqual({ level: 2, fromX: 10, toX: 10 + BEAM_STUB });
  });

  it('breaks beams at rests and does not beam a single note', () => {
    const layout = layoutBeams(beats([0, 8], [EIGHTH, 8, true], [QUARTER_TIME, 8]), 0, QUARTER_TIME);
    expect(layout.beamed.size).toBe(0);
    expect(layout.beams).toEqual([]);
  });

  it('measures groups from the measure start', () => {
    const layout = layoutBeams(beats([960 + 0, 8], [960 + EIGHTH, 8]), 960, QUARTER_TIME);
    expect(layout.beamed.size).toBe(2);
  });
});

describe('beam helpers', () => {
  it('counts flags per note value', () => {
    expect([1, 2, 4, 8, 16, 32, 64].map(flagCount)).toEqual([0, 0, 0, 1, 2, 3, 4]);
  });

  it('groups by dotted quarters in compound time', () => {
    expect(beamGroupTicks(6, 8)).toBe(QUARTER_TIME * 1.5);
    expect(beamGroupTicks(4, 4)).toBe(QUARTER_TIME);
    expect(beamGroupTicks(5, 8)).toBe(QUARTER_TIME);
  });
});
