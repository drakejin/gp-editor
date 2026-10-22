import type { Clef, Measure, Track } from '@gp-editor/core';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import {
  NOTATION,
  engraveNotationRowHeader,
  notationBandHeight,
  notationRowHeaderWidth,
} from '../src/score/notation';
import type { Palette } from '../src/theme';
import { makeSong } from '../test-support/songs';

const PALETTE: Palette = {
  background: '#000001',
  sidebar: '#000002',
  paper: '#FFFFFF',
  text: '#111111',
  muted: '#222222',
  line: '#333333',
  accent: '#FF0000',
  accentText: '#444444',
  selection: '#555555',
  danger: '#666666',
  border: '#777777',
};
const TOP = 50;
const yOf = (position: number) => TOP + ((8 - position) * NOTATION.space) / 2;

const GUITAR: Track = makeSong([[]]).tracks[0]!;
const DRUMS: Track = { ...GUITAR, isPercussion: true };

function measure(keySignature: number, clef: Clef = 'treble'): Measure {
  return { headerIndex: 0, clef, keySignature, beats: [] };
}

function texts(commands: readonly DrawCommand[], text: string): TextCommand[] {
  return commands.filter(
    (c): c is TextCommand => c.kind === 'text' && c.text === text,
  );
}

describe('notation band', () => {
  it('is the staff plus the room above and below it', () => {
    expect(NOTATION.space).toBe(8);
    expect(notationBandHeight()).toBe(
      NOTATION.above + 4 * NOTATION.space + NOTATION.below,
    );
  });
});

describe('notationRowHeaderWidth', () => {
  it('makes room for the clef and every accidental of the key signature', () => {
    const plain = notationRowHeaderWidth(GUITAR, 0);
    expect(plain).toBeGreaterThan(2.7 * NOTATION.space);
    expect(notationRowHeaderWidth(GUITAR, 3)).toBeGreaterThan(
      plain + 2 * NOTATION.space,
    );
    expect(notationRowHeaderWidth(GUITAR, -3)).toBe(
      notationRowHeaderWidth(GUITAR, 3),
    );
  });

  it('gives a percussion staff only its clef', () => {
    expect(notationRowHeaderWidth(DRUMS, 4)).toBe(
      notationRowHeaderWidth(DRUMS, 0),
    );
    expect(notationRowHeaderWidth(DRUMS, 0)).toBeLessThan(
      notationRowHeaderWidth(GUITAR, 0),
    );
  });
});

describe('engraveNotationRowHeader', () => {
  it('draws the octave-down treble clef on the G line and the key signature after it', () => {
    // Arrange
    const header = measure(2);

    // Act
    const commands = engraveNotationRowHeader(GUITAR, header, TOP, PALETTE);

    // Assert
    const [clef] = texts(commands, SMUFL.gClef8vb);
    expect(clef).toMatchObject({
      y: yOf(2),
      font: 'music',
      color: PALETTE.text,
    });
    const sharps = texts(commands, SMUFL.accidentalSharp);
    expect(sharps.map(c => c.y)).toEqual([yOf(8), yOf(5)]);
    expect(sharps[0]!.x).toBeGreaterThan(clef!.x + 2.6 * NOTATION.space);
    expect(sharps[1]!.x).toBeGreaterThan(sharps[0]!.x);
    const width = notationRowHeaderWidth(GUITAR, 2);
    expect(sharps[1]!.x + NOTATION.space).toBeLessThanOrEqual(width);
  });

  it('draws flats in their order', () => {
    const flats = texts(
      engraveNotationRowHeader(GUITAR, measure(-3), TOP, PALETTE),
      SMUFL.accidentalFlat,
    );
    expect(flats.map(c => c.y)).toEqual([yOf(4), yOf(7), yOf(3)]);
  });

  it('draws the octave-down bass clef on the F line with the key a third lower', () => {
    const commands = engraveNotationRowHeader(
      GUITAR,
      measure(1, 'bass'),
      TOP,
      PALETTE,
    );
    expect(texts(commands, SMUFL.fClef8vb)[0]!.y).toBe(yOf(6));
    expect(texts(commands, SMUFL.accidentalSharp).map(c => c.y)).toEqual([
      yOf(6),
    ]);
  });

  it('draws the unpitched percussion clef without a key signature', () => {
    const commands = engraveNotationRowHeader(DRUMS, measure(3), TOP, PALETTE);
    expect(texts(commands, SMUFL.unpitchedPercussionClef)[0]!.y).toBe(yOf(4));
    expect(texts(commands, SMUFL.accidentalSharp)).toHaveLength(0);
    expect(commands).toHaveLength(1);
  });
});
