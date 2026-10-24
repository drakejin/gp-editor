import type { MeasureHeader } from '@gp-editor/core';
import { TAB } from '../../lib/layout';
import {
  type DrawCommand,
  type LineCommand,
  SMUFL,
  type TextCommand,
} from '../draw';
import { digitGlyphs, horizontal, musicGlyph, vertical } from './glyphs';
import { GLYPH_WIDTH, NOTATION, STAFF, positionY } from './metrics';
import type { ClefKind } from './pitch';

interface ClefGlyph {
  readonly text: string;
  readonly width: number;
  /** Staff position of the glyph's baseline: the G line, F line, C line (alto: the middle line, tenor: the fourth). */
  readonly position: number;
}

export const CLEF_GLYPHS: Readonly<Record<ClefKind, ClefGlyph>> = {
  treble: { text: SMUFL.gClef8vb, width: GLYPH_WIDTH.gClef8vb, position: 2 },
  bass: { text: SMUFL.fClef8vb, width: GLYPH_WIDTH.fClef8vb, position: 6 },
  alto: { text: SMUFL.cClef8vb, width: GLYPH_WIDTH.cClef8vb, position: 4 },
  tenor: { text: SMUFL.cClef8vb, width: GLYPH_WIDTH.cClef8vb, position: 6 },
  percussion: {
    text: SMUFL.unpitchedPercussionClef,
    width: GLYPH_WIDTH.percussionClef,
    position: STAFF.middleLine,
  },
};

const BAR = {
  width: 1,
  /** Thick repeat bar, as on the tab staff. */
  thick: 3,
  dotInset: 8,
  dotRadius: 2,
} as const;
/** Time signature digits are centred where the tab staff centres its own. */
const TIME_SIGNATURE_CENTRE = TAB.timeSignatureWidth / 2 - 4;
const NUMERATOR_POSITION = 6;
const DENOMINATOR_POSITION = 2;

export function staffLines(
  x1: number,
  x2: number,
  top: number,
  color: string,
): LineCommand[] {
  return Array.from({ length: STAFF.lineCount }, (_, i) =>
    horizontal(x1, x2, top + i * NOTATION.space, STAFF.lineWidth, color),
  );
}

/** Bar line at the right edge, plus thick bars and dots for repeats (like the tab staff). */
export function barLines(
  header: MeasureHeader,
  width: number,
  top: number,
  color: string,
): DrawCommand[] {
  const bottom = positionY(top, STAFF.bottomLine);
  const commands: DrawCommand[] = [
    vertical(width, top, bottom, BAR.width, color),
  ];
  if (header.repeatOpen) {
    commands.push(
      {
        kind: 'rect',
        x: 0,
        y: top,
        width: BAR.thick,
        height: bottom - top,
        color,
      },
      ...repeatDots(BAR.dotInset, top, color),
    );
  }
  if (header.repeatClose > 0) {
    commands.push(
      {
        kind: 'rect',
        x: width - BAR.thick,
        y: top,
        width: BAR.thick,
        height: bottom - top,
        color,
      },
      ...repeatDots(width - BAR.dotInset, top, color),
    );
  }
  return commands;
}

/** Repeat dots sit in the two spaces around the middle line. */
function repeatDots(x: number, top: number, color: string): DrawCommand[] {
  return [STAFF.middleLine + 1, STAFF.middleLine - 1].map(position => ({
    kind: 'circle' as const,
    x,
    y: positionY(top, position),
    radius: BAR.dotRadius,
    color,
  }));
}

export function timeSignature(
  header: MeasureHeader,
  x: number,
  top: number,
  color: string,
): TextCommand[] {
  const centre = x + TIME_SIGNATURE_CENTRE;
  const { numerator, denominator } = header.timeSignature;
  return [
    musicGlyph(
      centre,
      positionY(top, NUMERATOR_POSITION),
      digitGlyphs(numerator, SMUFL.timeSigDigit0),
      color,
      'center',
    ),
    musicGlyph(
      centre,
      positionY(top, DENOMINATOR_POSITION),
      digitGlyphs(denominator, SMUFL.timeSigDigit0),
      color,
      'center',
    ),
  ];
}
