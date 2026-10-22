import { SMUFL, type TextCommand } from '../draw';
import { musicGlyph } from './glyphs';
import { positionY } from './metrics';
import type { ClefKind, PitchedClef } from './pitch';

/** Staff positions of the key signature's sharps (F C G D A E B) and flats (B E A D G C F). */
const SHARP_POSITIONS: Readonly<Record<PitchedClef, readonly number[]>> = {
  treble: [8, 5, 9, 6, 3, 7, 4],
  bass: [6, 3, 7, 4, 1, 5, 2],
};
const FLAT_POSITIONS: Readonly<Record<PitchedClef, readonly number[]>> = {
  treble: [4, 7, 3, 6, 2, 5, 1],
  bass: [2, 5, 1, 4, 0, 3, -1],
};

export interface KeyPlacement {
  readonly x: number;
  readonly top: number;
  /** From one accidental to the next. */
  readonly advance: number;
  readonly color: string;
}

/** Number of accidentals drawn for a key signature on a staff (percussion staves have none). */
export function keyAccidentalCount(key: number, clef: ClefKind): number {
  return clef === 'percussion' ? 0 : Math.min(7, Math.abs(Math.trunc(key)));
}

function accidentals(
  key: number,
  clef: ClefKind,
  glyph: string,
  placement: KeyPlacement,
): TextCommand[] {
  if (clef === 'percussion') {
    return [];
  }
  const positions = (key > 0 ? SHARP_POSITIONS : FLAT_POSITIONS)[clef].slice(
    0,
    keyAccidentalCount(key, clef),
  );
  return positions.map((position, i) =>
    musicGlyph(
      placement.x + i * placement.advance,
      positionY(placement.top, position),
      glyph,
      placement.color,
    ),
  );
}

export function keySignature(
  key: number,
  clef: ClefKind,
  placement: KeyPlacement,
): TextCommand[] {
  return accidentals(
    key,
    clef,
    key > 0 ? SMUFL.accidentalSharp : SMUFL.accidentalFlat,
    placement,
  );
}

/** A key change inside a row: the new key, or naturals cancelling the old key when the new one is C. */
export function keyChange(
  previousKey: number,
  key: number,
  clef: ClefKind,
  placement: KeyPlacement,
): TextCommand[] {
  return key === 0
    ? accidentals(previousKey, clef, SMUFL.accidentalNatural, placement)
    : keySignature(key, clef, placement);
}
