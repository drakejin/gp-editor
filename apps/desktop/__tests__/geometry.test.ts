import { TAB } from '../src/lib/layout';
import { ROW, SCORE_MODES, type ScoreMode, rowGeometry, showsFretboard, showsNotation, showsTab, toScoreMode } from '../src/score/geometry';
import { NOTATION, notationBandHeight } from '../src/score/notation';
import { BEND } from '../src/score/symbols/bends';
import { BEND_TIP, TAB_MARKS } from '../src/score/symbols/tab-geometry';
import { makeSong } from '../test-support/songs';

const GUITAR = makeSong([[]]).tracks[0]!;
const DRUMS = { ...GUITAR, isPercussion: true };

describe('what each score mode shows', () => {
  it.each<[ScoreMode, boolean, boolean, boolean]>([
    ['notationAndTab', true, true, true],
    ['notation', true, false, false],
    ['tab', false, true, true],
  ])('%s: notation %s, tab %s, neck %s', (mode, notation, tab, fretboard) => {
    expect(showsNotation(mode)).toBe(notation);
    expect(showsTab(mode)).toBe(tab);
    expect(showsFretboard(mode, GUITAR)).toBe(fretboard);
  });

  it('never shows the neck for a percussion track', () => {
    expect(SCORE_MODES.map((mode) => showsFretboard(mode, DRUMS))).toEqual([false, false, false]);
  });

  it('reads a mode from a native event, falling back to score + tab', () => {
    expect(toScoreMode('tab')).toBe('tab');
    expect(toScoreMode('notation')).toBe('notation');
    expect(toScoreMode('')).toBe('notationAndTab');
    expect(toScoreMode(undefined)).toBe('notationAndTab');
    expect(toScoreMode(3)).toBe('notationAndTab');
  });

  it('covers every mode', () => {
    expect(SCORE_MODES).toEqual(['notationAndTab', 'notation', 'tab']);
  });
});

describe('the dynamics band', () => {
  it('is left out when the track never changes dynamic', () => {
    // Act
    const geometries = SCORE_MODES.map((mode) => rowGeometry(mode, 6));

    // Assert
    expect(geometries.map((geometry) => geometry.dynamicsY)).toEqual([undefined, undefined, undefined]);
  });

  it.each(SCORE_MODES)('makes a %s row taller by the band', (mode) => {
    // Act
    const plain = rowGeometry(mode, 6);
    const withDynamics = rowGeometry(mode, 6, { hasDynamics: true });

    // Assert
    expect(withDynamics.height).toBe(plain.height + ROW.dynamics);
  });

  it('goes under the notation staff, above the tab marks, when both staves are shown', () => {
    // Act
    const geometry = rowGeometry('notationAndTab', 6, { markLaneCount: 2, hasDynamics: true });

    // Assert
    expect(geometry.dynamicsY).toBeGreaterThan(geometry.notationTop! + notationBandHeight() - NOTATION.above);
    expect(geometry.dynamicsY).toBeLessThan(geometry.marksY! - ROW.marks / 2 - TAB_MARKS.laneHeight);
  });

  it('goes under the notation staff in notation-only rows', () => {
    // Act
    const geometry = rowGeometry('notation', 6, { hasDynamics: true });

    // Assert
    expect(geometry.dynamicsY).toBeGreaterThan(geometry.notationTop! + notationBandHeight() - NOTATION.above);
    expect(geometry.dynamicsY).toBeLessThan(geometry.height - ROW.gap);
  });

  it('goes under the rhythm of the tab staff in tab-only rows', () => {
    // Act
    const geometry = rowGeometry('tab', 6, { hasDynamics: true });

    // Assert
    expect(geometry.dynamicsY).toBeGreaterThan(geometry.tabTop! + 5 * TAB.stringGap + ROW.rhythm);
    expect(geometry.dynamicsY).toBeLessThan(geometry.height - ROW.gap);
  });

  it('keeps the tab staff and its marks where they were in tab-only rows', () => {
    // Act
    const plain = rowGeometry('tab', 6);
    const withDynamics = rowGeometry('tab', 6, { hasDynamics: true });

    // Assert
    expect(withDynamics).toMatchObject({ marksY: plain.marksY, tabTop: plain.tabTop });
  });
});

describe('the bend band', () => {
  it.each<ScoreMode>(['notationAndTab', 'tab'])('makes a %s row taller and lifts the marks off the tab staff', (mode) => {
    // Act
    const plain = rowGeometry(mode, 6);
    const withBends = rowGeometry(mode, 6, { hasBends: true });

    // Assert
    expect(withBends.height).toBe(plain.height + ROW.bends);
    expect(withBends.tabTop! - withBends.marksY!).toBe(plain.tabTop! - plain.marksY! + ROW.bends);
  });

  it('keeps the lowest mark lane above the label of the highest stacked bend', () => {
    // Arrange
    const geometry = rowGeometry('tab', 6, { hasBends: true });
    const highestLabelTop = geometry.tabTop! - BEND_TIP - BEND.maxStack - BEND.labelGap - BEND.labelSize / 2;

    // Assert
    expect(geometry.marksY! + TAB_MARKS.laneHeight / 2).toBeLessThanOrEqual(highestLabelTop);
  });

  it('is left out of notation-only rows', () => {
    expect(rowGeometry('notation', 6, { hasBends: true })).toEqual(rowGeometry('notation', 6));
  });
});

describe('the lyrics band', () => {
  it('goes right under the notation staff, above the dynamics', () => {
    // Act
    const plain = rowGeometry('notationAndTab', 6, { hasDynamics: true });
    const sung = rowGeometry('notationAndTab', 6, { hasDynamics: true, hasLyrics: true });

    // Assert
    expect(sung.height).toBe(plain.height + ROW.lyrics);
    expect(sung.lyricsY).toBeGreaterThan(sung.notationTop! + notationBandHeight() - NOTATION.above);
    expect(sung.lyricsY).toBeLessThan(sung.dynamicsY!);
  });

  it('goes under the tab staff when notation is hidden', () => {
    const sung = rowGeometry('tab', 6, { hasLyrics: true });
    expect(sung.lyricsY).toBeGreaterThan(sung.tabTop! + 5 * TAB.stringGap);
    expect(sung.lyricsY).toBeLessThan(sung.height - ROW.gap);
  });

  it('is left out without lyrics', () => {
    expect(rowGeometry('notation', 6).lyricsY).toBeUndefined();
  });
});
