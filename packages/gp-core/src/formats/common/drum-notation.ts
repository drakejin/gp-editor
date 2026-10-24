// How Guitar Pro writes each drum of its factory kit (no TuxGuitar counterpart): staff position, noteheads and technique
// symbol, read from the kit's articulations (drum-kit.ts). The app's score and its drum key draw drums by it.
import { type DrumArticulation, type DrumElement, FACTORY_DRUM_KIT } from './drum-kit';

/** The SMuFL noteheads the kit names. */
export const DRUM_NOTEHEADS = [
  'noteheadBlack', 'noteheadHalf', 'noteheadWhole', 'noteheadXBlack', 'noteheadXHalf', 'noteheadXWhole', 'noteheadDiamondWhite',
  'noteheadCircleSlash', 'noteheadCircleX', 'noteheadHeavyX', 'noteheadHeavyXHat', 'noteheadTriangleUpBlack', 'noteheadTriangleUpHalf',
  'noteheadTriangleUpWhole', 'noteheadNull', 'noteheadSlashedBlack2',
] as const;
export type DrumNotehead = (typeof DRUM_NOTEHEADS)[number];

/** The SMuFL symbols the kit writes beside a notehead. */
export const DRUM_TECHNIQUE_SYMBOLS = ['pictEdgeOfCymbal', 'articStaccatoAbove', 'noteheadParenthesis', 'stringsUpBow', 'stringsDownBow', 'guitarGolpe'] as const;
export type DrumTechniqueSymbol = (typeof DRUM_TECHNIQUE_SYMBOLS)[number];

/**
 * Where a technique symbol goes: above or below the staff, around the notehead (inside), or on the notehead's side away
 * from the stem, as articulations go (outside).
 */
export const DRUM_TECHNIQUE_PLACEMENTS = ['above', 'below', 'inside', 'outside'] as const;
export type DrumTechniquePlacement = (typeof DRUM_TECHNIQUE_PLACEMENTS)[number];

/** A drum's notehead for black notes (quarter and shorter), half notes and whole notes. */
export interface DrumNoteheads {
  readonly black: DrumNotehead;
  readonly half: DrumNotehead;
  readonly whole: DrumNotehead;
}

export interface DrumTechnique {
  readonly symbol: DrumTechniqueSymbol;
  readonly placement: DrumTechniquePlacement;
}

/** How the score writes one drum of the kit. */
export interface DrumNotation {
  /** The key a drum note's fret holds: Guitar Pro's articulation id (its input MIDI number; General MIDI's for 35–81). */
  readonly key: number;
  /** The General MIDI percussion key it plays. */
  readonly outputKey: number;
  /** Staff position: 0 = the bottom line, 8 = the top line, one step per line or space. */
  readonly position: number;
  readonly noteheads: DrumNoteheads;
  readonly technique?: DrumTechnique;
  /** The kit's element ("Charley"), its type ("hiHat") and its index in the kit. */
  readonly elementName: string;
  readonly elementType: string;
  readonly elementIndex: number;
  /** The articulation ("Hi-Hat (closed)") and its index in its element. */
  readonly articulationName: string;
  readonly articulationIndex: number;
}

/** Guitar Pro's staff line 0 is the top line; its lines count down a step at a time. */
const TOP_LINE_POSITION = 8;
const PLAIN_NOTEHEADS: DrumNoteheads = { black: 'noteheadBlack', half: 'noteheadHalf', whole: 'noteheadWhole' };

function isOneOf<T extends string>(values: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (values as readonly string[]).includes(value);
}

function noteheadsOf(articulation: DrumArticulation): DrumNoteheads {
  const [black, half, whole] = articulation.noteheads.split(' ');
  return isOneOf(DRUM_NOTEHEADS, black) && isOneOf(DRUM_NOTEHEADS, half) && isOneOf(DRUM_NOTEHEADS, whole) ? { black, half, whole } : PLAIN_NOTEHEADS;
}

function techniqueOf({ techniqueSymbol: symbol, techniquePlacement: placement }: DrumArticulation): DrumTechnique | undefined {
  return isOneOf(DRUM_TECHNIQUE_SYMBOLS, symbol) && isOneOf(DRUM_TECHNIQUE_PLACEMENTS, placement) ? { symbol, placement } : undefined;
}

function notationOf(element: DrumElement, elementIndex: number, articulation: DrumArticulation, articulationIndex: number): DrumNotation {
  const technique = techniqueOf(articulation);
  return {
    key: articulation.inputMidi,
    outputKey: articulation.outputMidi,
    position: TOP_LINE_POSITION - articulation.staffLine,
    noteheads: noteheadsOf(articulation),
    ...(technique === undefined ? {} : { technique }),
    elementName: element.name,
    elementType: element.type,
    elementIndex,
    articulationName: articulation.name,
    articulationIndex,
  };
}

const ALL_NOTATIONS: readonly DrumNotation[] = FACTORY_DRUM_KIT.flatMap((element, elementIndex) =>
  element.articulations.map((articulation, articulationIndex) => notationOf(element, elementIndex, articulation, articulationIndex)),
);

/** Every drum of the factory kit in the kit's order, one per key (the first articulation of a key two elements share). */
export const DRUM_KIT_NOTATIONS: readonly DrumNotation[] = ALL_NOTATIONS.filter(
  (notation, index) => ALL_NOTATIONS.findIndex((other) => other.key === notation.key) === index,
);

const NOTATION_BY_KEY: ReadonlyMap<number, DrumNotation> = new Map(DRUM_KIT_NOTATIONS.map((notation) => [notation.key, notation]));

/** How the score writes a drum note's key; undefined for a key the factory kit lacks. */
export function drumNotation(key: number): DrumNotation | undefined {
  return NOTATION_BY_KEY.get(key);
}
