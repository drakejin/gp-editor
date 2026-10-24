import type { TripletFeel } from '@gp-editor/core';
import type { DrawCommand, LineCommand, TextCommand } from './draw';
import { textWidth } from './symbols/shapes';
import { type MusicGlyph, TEXT_NOTE_GLYPHS, staffSpace } from './symbols/smufl';

/**
 * Guitar Pro's triplet-feel (swing) mark in the heading: "♫ = ♩♪" with a triplet bracket over the right side for
 * eighths, the same a value shorter for sixteenths, and "Straight" where the feel goes back to straight.
 */

export const SWING = {
  /** Music size of the notes: about as tall as the tempo text beside them. */
  musicSize: 12,
  textSize: 10,
  /** Between the notes and "=". */
  gap: 3,
  /** Between the two notes of the right side when they are not beamed, in staff spaces. */
  noteGap: 1,
  /** The triplet bracket, in staff spaces above the baseline (clear of the stems), and its hooks. */
  bracketRise: 4.3,
  hook: 0.6,
  digitSize: 6.5,
  /** Room left either side of the bracket's middle for the 3. */
  digitGap: 2.5,
  lineWidth: 0.8,
} as const;

const G = TEXT_NOTE_GLYPHS;

/** A side of the mark: glyphs drawn as one text run, or one after another with a gap. */
type Side = readonly (readonly MusicGlyph[])[];

const SIDES: Readonly<Record<Exclude<TripletFeel, 'none'>, { readonly straight: Side; readonly swung: Side }>> = {
  eighth: { straight: [[G.quarter, G.beam8th, G.beamEnd8th]], swung: [[G.quarter], [G.eighth]] },
  sixteenth: { straight: [[G.quarter, G.beam16th, G.beamEnd16th]], swung: [[G.quarter, G.beam8th, G.beamEnd16th]] },
};

const advance = (glyphs: readonly MusicGlyph[]) => glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) * staffSpace(SWING.musicSize);

/** The side's glyph runs from x, and where it ends. */
function engraveSide(side: Side, x: number, baseline: number, color: string): { readonly commands: TextCommand[]; readonly end: number } {
  const noteGap = SWING.noteGap * staffSpace(SWING.musicSize);
  return side.reduce<{ readonly commands: TextCommand[]; readonly end: number }>(
    (placed, glyphs, i) => {
      const start = placed.end + (i > 0 ? noteGap : 0);
      const text = glyphs.map((glyph) => glyph.text).join('');
      const command: TextCommand = { kind: 'text', x: start, y: baseline, text, size: SWING.musicSize, color, font: 'music', align: 'left' };
      return { commands: [...placed.commands, command], end: start + advance(glyphs) };
    },
    { commands: [], end: x },
  );
}

/** A triplet bracket from x1 to x2 at y with its hooks down, broken in the middle for a 3. */
function tripletBracket(x1: number, x2: number, y: number, color: string): DrawCommand[] {
  const middle = (x1 + x2) / 2;
  const hook = SWING.hook * staffSpace(SWING.musicSize);
  const line = (ax: number, ay: number, bx: number, by: number): LineCommand => ({ kind: 'line', x1: ax, y1: ay, x2: bx, y2: by, width: SWING.lineWidth, color });
  return [
    line(x1, y + hook, x1, y),
    line(x1, y, middle - SWING.digitGap, y),
    line(middle + SWING.digitGap, y, x2, y),
    line(x2, y, x2, y + hook),
    { kind: 'text', x: middle, y, text: '3', size: SWING.digitSize, color, font: 'ui', align: 'center' },
  ];
}

/** The triplet-feel mark starting at x, its notes centred about the text line `y` (a ui text's centre). */
export function engraveTripletFeel(feel: TripletFeel, x: number, y: number, color: string): DrawCommand[] {
  if (feel === 'none') {
    // i18n-exempt: the score's tempo-mark wording
    return [{ kind: 'text', x, y, text: 'Straight', size: SWING.textSize, color, font: 'ui', align: 'left' }];
  }
  const space = staffSpace(SWING.musicSize);
  // Centre the notes' ink (stem tops to note heads) on the line.
  const baseline = y + ((G.quarter.top + G.quarter.bottom) / 2) * space;
  const sides = SIDES[feel];
  const left = engraveSide(sides.straight, x, baseline, color);
  const equalsX = left.end + SWING.gap;
  const right = engraveSide(sides.swung, equalsX + textWidth('=', SWING.textSize) + SWING.gap, baseline, color);
  const rightStart = right.commands[0]?.x ?? right.end;
  return [
    ...left.commands,
    { kind: 'text', x: equalsX, y, text: '=', size: SWING.textSize, color, font: 'ui', align: 'left' },
    ...right.commands,
    ...tripletBracket(rightStart, right.end, baseline - SWING.bracketRise * space, color),
  ];
}
