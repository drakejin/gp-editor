import { type BeamLink, type MeasureHeader, QUARTER_TIME } from '@gp-editor/core';
import { BEAM_STUB, beamGroupBoundsOf, flagCount, layoutBeams, type RhythmBeat } from '../src/lib/beams';

const EIGHTH = QUARTER_TIME / 2;
const SIXTEENTH = QUARTER_TIME / 4;
/** A 4/4 bar beamed by the quarter. */
const QUARTERS = [0, 1, 2, 3, 4].map((quarter) => quarter * QUARTER_TIME);

function beats(...specs: Array<[start: number, value: number, isRest?: boolean]>): RhythmBeat[] {
  return specs.map(([start, value, isRest = false], i) => ({ x: 10 + i * 20, start, value, isRest }));
}

/** Eighths (or `value`s) from the bar start, with these beams to the next beat. */
function linked(value: number, ...links: Array<BeamLink | undefined>): RhythmBeat[] {
  const ticks = (QUARTER_TIME * 4) / value;
  return links.map((link, i) => ({ x: 10 + i * 20, start: i * ticks, value, isRest: false, ...(link === undefined ? {} : { beamToNext: link }) }));
}

function header(numerator: number, denominator: number, beamGrouping?: MeasureHeader['beamGrouping']): MeasureHeader {
  const base: MeasureHeader = { number: 1, start: 0, timeSignature: { numerator, denominator }, tempo: 120, repeatOpen: false, repeatClose: 0, repeatAlternative: 0, tripletFeel: 'none' };
  return beamGrouping === undefined ? base : { ...base, beamGrouping };
}

describe('layoutBeams', () => {
  it('beams eighths within each quarter and leaves quarters alone', () => {
    // Arrange
    const measure = beats([0, 8], [EIGHTH, 8], [QUARTER_TIME, 4], [2 * QUARTER_TIME, 8], [2 * QUARTER_TIME + EIGHTH, 8]);

    // Act
    const layout = layoutBeams(measure, 0, QUARTERS);

    // Assert
    expect([...layout.beamed]).toEqual([0, 1, 3, 4]);
    expect(layout.beams).toEqual([
      { level: 1, fromX: 10, toX: 30 },
      { level: 1, fromX: 70, toX: 90 },
    ]);
  });

  it('joins sixteenth beams between sixteenths and stubs a lone one', () => {
    const dotted = beats([0, 8], [EIGHTH + SIXTEENTH, 16]);
    expect(layoutBeams(dotted, 0, QUARTERS).beams).toEqual([
      { level: 1, fromX: 10, toX: 30 },
      { level: 2, fromX: 30 - BEAM_STUB, toX: 30 },
    ]);
    const run = beats([0, 16], [SIXTEENTH, 16], [EIGHTH, 8]);
    expect(layoutBeams(run, 0, QUARTERS).beams).toEqual([
      { level: 1, fromX: 10, toX: 50 },
      { level: 2, fromX: 10, toX: 30 },
    ]);
    const leading = beats([0, 16], [SIXTEENTH, 8]);
    expect(layoutBeams(leading, 0, QUARTERS).beams).toContainEqual({ level: 2, fromX: 10, toX: 10 + BEAM_STUB });
  });

  it('breaks beams at rests and does not beam a single note', () => {
    const layout = layoutBeams(beats([0, 8], [EIGHTH, 8, true], [QUARTER_TIME, 8]), 0, QUARTERS);
    expect(layout.beamed.size).toBe(0);
    expect(layout.beams).toEqual([]);
  });

  it('breaks a beam where a beat says so and joins one across the beat grouping', () => {
    // Act
    const broken = layoutBeams(linked(8, 'break', undefined, undefined, undefined), 0, QUARTERS);
    const joined = layoutBeams(linked(8, undefined, 'join', undefined, undefined), 0, QUARTERS);

    // Assert
    expect(broken.beams).toEqual([{ level: 1, fromX: 50, toX: 70 }]);
    expect(joined.beams).toEqual([{ level: 1, fromX: 10, toX: 70 }]);
  });

  it('keeps only the eighth beam across a secondary break', () => {
    // Act
    const layout = layoutBeams(linked(16, undefined, 'breakSecondary', undefined, undefined), 0, QUARTERS);

    // Assert
    expect(layout.beams).toEqual([
      { level: 1, fromX: 10, toX: 70 },
      { level: 2, fromX: 10, toX: 30 },
      { level: 2, fromX: 50, toX: 70 },
    ]);
  });

  it('stubs a lone sixteenth after a secondary break back towards its group', () => {
    // Act
    const layout = layoutBeams(linked(16, undefined, 'breakSecondary', undefined), 0, QUARTERS);

    // Assert
    expect(layout.beams).toContainEqual({ level: 2, fromX: 50 - BEAM_STUB, toX: 50 });
  });

  it('measures groups from the measure start', () => {
    const layout = layoutBeams(beats([960 + 0, 8], [960 + EIGHTH, 8]), 960, QUARTERS);
    expect(layout.beamed.size).toBe(2);
  });
});

describe('beam helpers', () => {
  it('counts flags per note value', () => {
    expect([1, 2, 4, 8, 16, 32, 64].map(flagCount)).toEqual([0, 0, 0, 1, 2, 3, 4]);
  });

  it('groups by the beat, by dotted quarters in compound time, or as the bar says', () => {
    expect(beamGroupBoundsOf(header(6, 8))).toEqual([0, 1.5 * QUARTER_TIME, 3 * QUARTER_TIME]);
    expect(beamGroupBoundsOf(header(4, 4))).toEqual(QUARTERS);
    expect(beamGroupBoundsOf(header(5, 8))).toEqual([0, QUARTER_TIME, 2 * QUARTER_TIME, 2.5 * QUARTER_TIME]);
    expect(beamGroupBoundsOf(header(4, 4, { unit: 8, groups: [3, 3, 2] }))).toEqual([0, 3 * EIGHTH, 6 * EIGHTH, 8 * EIGHTH]);
  });

  it('beams notes past the groups (an over-full bar) by the quarter', () => {
    // Act
    const layout = layoutBeams(beats([4 * QUARTER_TIME, 8], [4 * QUARTER_TIME + EIGHTH, 8], [5 * QUARTER_TIME, 8]), 0, QUARTERS);

    // Assert
    expect(layout.beams).toEqual([{ level: 1, fromX: 10, toX: 30 }]);
  });
});
