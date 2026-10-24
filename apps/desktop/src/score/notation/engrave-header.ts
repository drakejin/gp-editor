import type { Measure, Track } from '@gp-editor/core';
import type { Palette } from '../../theme';
import type { DrawCommand } from '../draw';
import { musicGlyph } from './glyphs';
import { keyAccidentalCount, keySignature } from './key-signature';
import { NOTATION, positionY } from './metrics';
import { type ClefKind, clefKind } from './pitch';
import { CLEF_GLYPHS } from './staff';

const HEADER = {
  padLeft: 6,
  clefGap: 6,
  /** Key signature accidentals are spaced one staff space apart. */
  keyAdvance: NOTATION.space,
  padRight: 2,
} as const;

/**
 * Pitched tracks reserve the wider of the treble and bass clefs (and of a C clef when the track has one), so a clef
 * change does not move the key signature.
 */
function clefColumnWidth(track: Track): number {
  if (track.isPercussion) {
    return CLEF_GLYPHS.percussion.width;
  }
  const hasCClef = track.measures.some(
    measure => measure.clef === 'alto' || measure.clef === 'tenor',
  );
  return Math.max(
    CLEF_GLYPHS.treble.width,
    CLEF_GLYPHS.bass.width,
    hasCClef ? CLEF_GLYPHS.alto.width : 0,
  );
}

function headerClef(track: Track): ClefKind {
  return track.isPercussion ? 'percussion' : 'treble';
}

/** Width of the clef and key signature at the start of a row. */
export function notationRowHeaderWidth(track: Track, key: number): number {
  const accidentals = keyAccidentalCount(key, headerClef(track));
  const keyWidth =
    accidentals > 0 ? accidentals * HEADER.keyAdvance + HEADER.padRight : 0;
  return HEADER.padLeft + clefColumnWidth(track) + HEADER.clefGap + keyWidth;
}

/** Clef and key signature at the start of a row (x = 0); the caller draws the staff lines under them. */
export function engraveNotationRowHeader(
  track: Track,
  measure: Measure,
  top: number,
  palette: Palette,
): DrawCommand[] {
  const clef = clefKind(track, measure.clef);
  const glyph = CLEF_GLYPHS[clef];
  const keyX = HEADER.padLeft + clefColumnWidth(track) + HEADER.clefGap;
  return [
    musicGlyph(
      HEADER.padLeft,
      positionY(top, glyph.position),
      glyph.text,
      palette.text,
    ),
    ...keySignature(measure.keySignature, clef, {
      x: keyX,
      top,
      advance: HEADER.keyAdvance,
      color: palette.text,
    }),
  ];
}
