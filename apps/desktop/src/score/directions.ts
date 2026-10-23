import { type DirectionJump, type DirectionTarget, type MeasureHeader, type MusicalDirection, type Song, isDirectionTarget } from '@gp-editor/core';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { MARK_GLYPHS, type MusicGlyph, staffSpace } from './symbols/smufl';
import { textWidth } from './symbols/shapes';

/**
 * Musical directions above the staves, as Guitar Pro shows them: the segno and coda signs at the start of the bar,
 * the jumps (D.S. al Coda, To Coda …) and the fine as words at its end. Their band is there only when the song has a
 * direction (`hasDirections`).
 */

/** Music size of the signs (one em = four staff spaces). */
const SIGN_SIZE = 18;
const TEXT_SIZE = 10;
/** The words' centre sits this far above the signs' baseline. */
const TEXT_RAISE = 5;
const EDGE = 4;
const GAP = 2;
/** Room between the signs and the words when a bar has both. */
const SIDE_GAP = 10;

/** The words Guitar Pro writes for the jumps and the fine. */
export const DIRECTION_TEXTS: Readonly<Record<DirectionJump | 'fine', string>> = {
  fine: 'Fine',
  daCapo: 'D.C.',
  daCapoAlCoda: 'D.C. al Coda',
  daCapoAlDoubleCoda: 'D.C. al Double Coda',
  daCapoAlFine: 'D.C. al Fine',
  daSegno: 'D.S.',
  daSegnoAlCoda: 'D.S. al Coda',
  daSegnoAlDoubleCoda: 'D.S. al Double Coda',
  daSegnoAlFine: 'D.S. al Fine',
  daSegnoSegno: 'D.S.S.',
  daSegnoSegnoAlCoda: 'D.S.S. al Coda',
  daSegnoSegnoAlDoubleCoda: 'D.S.S. al Double Coda',
  daSegnoSegnoAlFine: 'D.S.S. al Fine',
  daCoda: 'To Coda',
  daDoubleCoda: 'To Double Coda',
};

/** The signs of a target drawn at the start of the bar: a double sign is the sign twice. */
const SIGNS: Readonly<Record<Exclude<DirectionTarget, 'fine'>, readonly MusicGlyph[]>> = {
  segno: [MARK_GLYPHS.segno],
  segnoSegno: [MARK_GLYPHS.segno, MARK_GLYPHS.segno],
  coda: [MARK_GLYPHS.coda],
  doubleCoda: [MARK_GLYPHS.coda, MARK_GLYPHS.coda],
};

export function hasDirections(song: Song): boolean {
  return song.measureHeaders.some((header) => (header.directions?.length ?? 0) > 0);
}

function signsOf(directions: readonly MusicalDirection[]): readonly MusicGlyph[] {
  return directions.flatMap((direction) => (isDirectionTarget(direction) && direction !== 'fine' ? SIGNS[direction] : []));
}

/** The words at the end of the bar: the fine, then the jumps; '' without any. */
function wordsOf(directions: readonly MusicalDirection[]): string {
  const worded = directions.filter((direction): direction is DirectionJump | 'fine' => direction === 'fine' || !isDirectionTarget(direction));
  return worded.map((direction) => DIRECTION_TEXTS[direction]).join('   ');
}

function signsWidth(signs: readonly MusicGlyph[]): number {
  return signs.reduce((width, sign) => width + sign.advance * staffSpace(SIGN_SIZE) + GAP, 0);
}

/** The narrowest a bar can be to hold its directions side by side (0 without any). */
export function directionsWidth(header: MeasureHeader | undefined): number {
  const directions = header?.directions ?? [];
  if (directions.length === 0) {
    return 0;
  }
  const words = wordsOf(directions);
  return EDGE * 2 + signsWidth(signsOf(directions)) + (words === '' ? 0 : SIDE_GAP + textWidth(words, TEXT_SIZE));
}

/** The bar's directions in their band (measure-local; `y` is the signs' baseline). */
export function engraveDirections(header: MeasureHeader, width: number, y: number, palette: Palette): DrawCommand[] {
  const directions = header.directions ?? [];
  const space = staffSpace(SIGN_SIZE);
  const signs = signsOf(directions).reduce<{ readonly x: number; readonly commands: readonly DrawCommand[] }>(
    (placed, sign) => ({
      x: placed.x + sign.advance * space + GAP,
      commands: [...placed.commands, { kind: 'text', x: placed.x, y, text: sign.text, size: SIGN_SIZE, color: palette.text, font: 'music', align: 'left' }],
    }),
    { x: EDGE, commands: [] },
  ).commands;
  const words = wordsOf(directions);
  const text: DrawCommand[] = words === '' ? [] : [{ kind: 'text', x: width - EDGE, y: y - TEXT_RAISE, text: words, size: TEXT_SIZE, color: palette.text, font: 'ui', align: 'right', bold: true }];
  return [...signs, ...text];
}
