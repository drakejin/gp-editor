import { SCORE_MODES, type ScoreMode, showsFretboard, showsNotation, showsTab, toScoreMode } from '../src/score/geometry';
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
