import { EMPTY_NOTE_EFFECT } from '@gp-editor/core';
import { TECHNIQUE_GLYPHS } from '../src/score/symbols/smufl';
import {
  WIDE_VIBRATO_GLYPH,
  hasVibrato,
  hasWideVibrato,
  splitByVibratoWidth,
  splitVibratoRun,
  vibratoGlyph,
} from '../src/score/symbols/vibrato';
import { beat, note } from '../test-support/songs';

describe('vibrato marks', () => {
  it('counts slight and wide vibrato as vibrato', () => {
    // Act
    const found = [
      EMPTY_NOTE_EFFECT,
      { ...EMPTY_NOTE_EFFECT, vibrato: true },
      { ...EMPTY_NOTE_EFFECT, wideVibrato: true },
    ].map(hasVibrato);

    // Assert
    expect(found).toEqual([false, true, true]);
  });

  it('finds wide vibrato on any note of a beat', () => {
    // Act
    const found = [
      beat(960, [
        note(1, 5, { vibrato: true }),
        note(2, 5, { wideVibrato: true }),
      ]),
      beat(960, [note(1, 5, { vibrato: true })]),
      undefined,
    ].map(hasWideVibrato);

    // Assert
    expect(found).toEqual([true, false, false]);
  });

  it('draws wide vibrato with the wide SMuFL stroke: higher and longer than the slight one', () => {
    // Act
    const slight = vibratoGlyph(false);
    const wide = vibratoGlyph(true);

    // Assert
    expect(slight).toBe(TECHNIQUE_GLYPHS.guitarVibratoStroke);
    expect(wide).toBe(WIDE_VIBRATO_GLYPH);
    expect(wide.text).toBe('\u{eab3}');
    expect(wide.top).toBeGreaterThan(1.5 * slight.top);
    expect(wide.advance).toBeGreaterThan(slight.advance);
  });

  it('splits consecutive items where the vibrato width changes', () => {
    // Act
    const pieces = splitByVibratoWidth(
      [4, 5, 6, 7, 8],
      item => item === 6 || item === 7,
    );

    // Assert
    expect(pieces).toEqual([
      { isWide: false, items: [4, 5] },
      { isWide: true, items: [6, 7] },
      { isWide: false, items: [8] },
    ]);
    expect(splitByVibratoWidth([], () => true)).toEqual([]);
  });

  it('splits a run of beats, keeping its start on the first piece and its end on the last', () => {
    // Arrange
    const run = { first: 0, last: 3, isContinued: true, goesOn: true };

    // Act
    const pieces = splitVibratoRun(run, position => position === 1);

    // Assert
    expect(pieces).toEqual([
      { first: 0, last: 0, isContinued: true, goesOn: false, isWide: false },
      { first: 1, last: 1, isContinued: false, goesOn: false, isWide: true },
      { first: 2, last: 3, isContinued: false, goesOn: true, isWide: false },
    ]);
  });
});
