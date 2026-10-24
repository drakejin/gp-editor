/**
 * Standard-notation staff geometry and Bravura glyph metrics, in points.
 * Glyph sizes come from Bravura's bounding boxes (bravura_metadata.json), given in staff spaces.
 */

/** Staff geometry. Staff positions count diatonic steps up from the bottom line: 0 = bottom line, 8 = top line. */
export const NOTATION = {
  /** Distance between two staff lines. */
  space: 8,
  /** Room above the top line: four ledger lines, an 8va mark, ties and tuplet numbers. */
  above: 48,
  /** Room below the bottom line: the guitar's low E sits three ledger lines down, with a stem or tie under it. */
  below: 56,
} as const;

const SPACE = NOTATION.space;

export const STAFF = {
  lineCount: 5,
  topLine: 8,
  middleLine: 4,
  bottomLine: 0,
  lineWidth: 1,
} as const;

/** Bravura is drawn at four staff spaces, so one em spans the staff. */
export const MUSIC_FONT_SIZE = 4 * SPACE;

export const GLYPH_WIDTH = {
  noteheadBlack: 1.18 * SPACE,
  noteheadWhole: 1.688 * SPACE,
  noteheadX: 1.16 * SPACE,
  accidentalSharp: 0.996 * SPACE,
  accidentalFlat: 0.904 * SPACE,
  accidentalNatural: 0.672 * SPACE,
  flag: 1.12 * SPACE,
  rest: 1.13 * SPACE,
  gClef8vb: 2.684 * SPACE,
  fClef8vb: 2.736 * SPACE,
  cClef8vb: 2.796 * SPACE,
  percussionClef: 1.528 * SPACE,
} as const;

/** A clef where the clef changes inside a row is drawn smaller (a cue-size clef), at this share of the full size. */
export const CLEF_CHANGE_SCALE = 0.75;

export const STEM = {
  width: 1,
  length: 3.5 * SPACE,
  /** Stems join the notehead this far from its centre (Bravura's stemUpSE / stemDownNW anchors). */
  attach: 0.168 * SPACE,
} as const;

export const BEAM = {
  thickness: 0.5 * SPACE,
  /** From one beam's outer edge to the next. */
  spacing: 0.75 * SPACE,
  /** The steepest a beam may rise or fall over its whole length. */
  maxSlant: SPACE,
  /** Beams follow the outer notes at half their slope. */
  slantRatio: 0.5,
} as const;

export const LEDGER = {
  extension: 0.4 * SPACE,
  width: 1.2,
} as const;

export const ACCIDENTAL = {
  /** Between the accidental and the notehead. */
  gap: 0.2 * SPACE,
  column: 1.12 * SPACE,
  /** Accidentals closer than this (in staff positions) are put in different columns. */
  clearance: 6,
} as const;

export const DOT = {
  gap: 0.4 * SPACE,
  spacing: 0.6 * SPACE,
} as const;

export const TIE = {
  width: 1.2,
  gap: 1,
  /** Ties start this far above or below the note centre. */
  offset: 0.6 * SPACE,
  minHeight: 0.25 * SPACE,
  maxHeight: SPACE,
  /** Length of the arc drawn into a note tied from the previous measure. */
  entry: 2.5 * SPACE,
  /** Height of the halves of a tie across the bar line, so the two halves meet there. */
  crossHeight: 0.6 * SPACE,
} as const;

/** Slurs of hammer-ons, pull-offs and legato slides: from notehead centre to notehead centre. */
export const SLUR = {
  width: 1.2,
  offset: 0.6 * SPACE,
  minHeight: 0.4 * SPACE,
  maxHeight: 1.2 * SPACE,
  curvature: 0.12,
  crossHeight: 0.6 * SPACE,
} as const;

export const SLIDE = {
  width: 1.2,
  gap: 0.3 * SPACE,
  /** Slides out of and into a note. */
  shortLength: 1.5 * SPACE,
  shortRise: SPACE,
  /** A slide between two notes on the same staff position still slants a little. */
  minRise: 0.3 * SPACE,
} as const;

/** Parentheses around a ghost note's notehead. */
export const PAREN = {
  gap: 0.1 * SPACE,
  /** Room the parentheses take on each side of the notehead. */
  space: 0.6 * SPACE,
} as const;

export const ARTICULATION = {
  /** From the notehead or stem to the first articulation, and between stacked ones. */
  gap: 0.4 * SPACE,
} as const;

/** Trill, vibrato and tremolo strokes. */
export const ORNAMENT = {
  /** Clear of the staff, the notes and their stems. */
  gap: 0.8 * SPACE,
  /** Wavy lines end this far before the next note. */
  endGap: 0.5 * SPACE,
  /** Tremolo strokes over a note without a stem. */
  stemlessLift: 2 * SPACE,
  /** Tremolo strokes sit this far along the stem from the notehead. */
  stemRatio: 0.55,
} as const;

export const GRACE = {
  /** Grace accidentals are drawn at this share of the music font size. */
  scale: 0.66,
  gap: 0.4 * SPACE,
  ledgerExtension: 0.25 * SPACE,
  ledgerWidth: 1,
  /** A small slur under a hammered grace note. */
  slurHeight: 0.5 * SPACE,
} as const;

/** Strum arrows left of a chord. */
export const STROKE = {
  gap: 0.5 * SPACE,
  overhang: 0.6 * SPACE,
  width: 1,
} as const;

export const TUPLET = {
  /** SMuFL tuplet digit 0 (tuplet0); the digits follow it. Not in the SMUFL table of draw.ts. */
  digitZero: 0xe880,
  /** Height of a tuplet digit above its baseline. */
  height: 1.5 * SPACE,
  /** Advance of a tuplet digit. */
  digitWidth: 1.25 * SPACE,
  gap: 0.4 * SPACE,
  /** Bracket of a tuplet that is not beamed as a group. */
  hook: 0.5 * SPACE,
  bracketWidth: 0.8,
  /** Between the number and the bracket lines either side of it. */
  numberGap: 0.3 * SPACE,
} as const;

/** Notes beyond these positions are drawn one or more octaves closer to the staff with an 8va / 8vb mark. */
export const OTTAVA = {
  highest: 16,
  lowest: -9,
  maxOctaves: 3,
  fontSize: 10,
  /** Approximate advance of one label character at fontSize, to start the bracket line after the label. */
  charWidth: 5.6,
  labelGap: 3,
  /** Mark distance from the outermost notehead. */
  gap: 1.6 * SPACE,
  lineWidth: 0.8,
  /** Bracket lines shorter than this are left out. */
  minLine: 4,
  hook: 0.6 * SPACE,
} as const;

/** Height of the notation band: the room above, the staff and the room below. */
export function notationBandHeight(): number {
  return NOTATION.above + (STAFF.lineCount - 1) * SPACE + NOTATION.below;
}

/** y of a staff position. */
export function positionY(top: number, position: number): number {
  return top + ((STAFF.topLine - position) * SPACE) / 2;
}
