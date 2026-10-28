import { type DrumNotehead, type DrumNoteheads, type DrumTechnique, drumNotation } from '@gp-editor/core';
import { SMUFL } from '../draw';
import { GLYPH_WIDTH, NOTATION, OTTAVA, STAFF } from './metrics';

/** Where the percussion staff writes a drum note's key, and with which notehead and technique symbol. */
export interface DrumPlacement {
  /** Staff position: 0 = bottom line, 8 = top line. */
  readonly position: number;
  readonly noteheads: DrumNoteheads;
  readonly technique?: DrumTechnique;
}

/**
 * The staff positions a drum may take: the room the notation band keeps for notes (where pitched notes would move an
 * octave). Guitar Pro's kit puts some percussion far outside it (the guiro 30 steps below the bottom line); such a drum
 * is written on the middle line, as a key the kit lacks is, keeping its notehead.
 */
export const DRUM_ROOM = { lowest: OTTAVA.lowest, highest: OTTAVA.highest } as const;

const PLAIN_NOTEHEADS: DrumNoteheads = { black: 'noteheadBlack', half: 'noteheadHalf', whole: 'noteheadWhole' };
const SPACE = NOTATION.space;
const WHOLE = 1;
const HALF = 2;

/** Each drum notehead's glyph and width (Bravura's bounding boxes); a heavy x's hat and a slashed head's slash overhang it. */
const DRUM_HEADS: Readonly<Record<DrumNotehead, { readonly text: string; readonly width: number }>> = {
  noteheadBlack: { text: SMUFL.noteheadBlack, width: GLYPH_WIDTH.noteheadBlack },
  noteheadHalf: { text: SMUFL.noteheadHalf, width: GLYPH_WIDTH.noteheadBlack },
  noteheadWhole: { text: SMUFL.noteheadWhole, width: GLYPH_WIDTH.noteheadWhole },
  noteheadXBlack: { text: SMUFL.noteheadXBlack, width: GLYPH_WIDTH.noteheadX },
  noteheadXHalf: { text: SMUFL.noteheadXHalf, width: 1.336 * SPACE },
  noteheadXWhole: { text: SMUFL.noteheadXWhole, width: 1.508 * SPACE },
  noteheadDiamondWhite: { text: SMUFL.noteheadDiamondWhite, width: SPACE },
  noteheadCircleSlash: { text: SMUFL.noteheadCircleSlash, width: SPACE },
  noteheadCircleX: { text: SMUFL.noteheadCircleX, width: 0.996 * SPACE },
  noteheadHeavyX: { text: SMUFL.noteheadHeavyX, width: 1.54 * SPACE },
  noteheadHeavyXHat: { text: SMUFL.noteheadHeavyXHat, width: 1.54 * SPACE },
  noteheadTriangleUpBlack: { text: SMUFL.noteheadTriangleUpBlack, width: 1.172 * SPACE },
  noteheadTriangleUpHalf: { text: SMUFL.noteheadTriangleUpHalf, width: 1.14 * SPACE },
  noteheadTriangleUpWhole: { text: SMUFL.noteheadTriangleUpWhole, width: 1.276 * SPACE },
  // No ink (a golpe is its symbol alone): stems and ledger lines sit as for a black notehead.
  noteheadNull: { text: SMUFL.noteheadNull, width: GLYPH_WIDTH.noteheadBlack },
  noteheadSlashedBlack2: { text: SMUFL.noteheadSlashedBlack2, width: GLYPH_WIDTH.noteheadBlack },
};

/** Where and how a drum note's key is written: Guitar Pro's factory kit (gp-core `drumNotation`); a key it lacks on the middle line. */
export function drumPlacement(key: number): DrumPlacement {
  const notation = drumNotation(key);
  if (notation === undefined) {
    return { position: STAFF.middleLine, noteheads: PLAIN_NOTEHEADS };
  }
  const isInRoom = notation.position >= DRUM_ROOM.lowest && notation.position <= DRUM_ROOM.highest;
  return {
    position: isInRoom ? notation.position : STAFF.middleLine,
    noteheads: notation.noteheads,
    ...(notation.technique === undefined ? {} : { technique: notation.technique }),
  };
}

/** A drum's notehead for a note value (1 = whole, 2 = half, else black) and its width. */
export function drumHeadGlyph(noteheads: DrumNoteheads, value: number): { readonly glyph: string; readonly width: number } {
  const name = value === WHOLE ? noteheads.whole : value === HALF ? noteheads.half : noteheads.black;
  const head = DRUM_HEADS[name];
  return { glyph: head.text, width: head.width };
}
