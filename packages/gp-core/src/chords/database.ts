// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordDatabase (LGPL-2.1): the chord types and their notes.

/** TuxGuitar's chord types, in its order (the recognizer grades later types as more unusual). "M" is the major triad. */
export type ChordTypeName =
  | 'M'
  | '7'
  | 'maj7'
  | '6'
  | 'm'
  | 'm7'
  | 'm/maj7'
  | 'm6'
  | 'sus2'
  | 'sus4'
  | '7sus2'
  | '7sus4'
  | 'dim'
  | 'dim7'
  | 'aug'
  | '5';

export interface ChordType {
  readonly name: ChordTypeName;
  /**
   * The notes the chord must have, as TuxGuitar counts them: semitones above the root plus one (1 = root, 4 = minor
   * third, 5 = major third, 8 = fifth, 11 = minor seventh, 12 = major seventh).
   */
  readonly requiredNotes: readonly number[];
}

export const CHORD_TYPES: readonly ChordType[] = [
  { name: 'M', requiredNotes: [1, 5, 8] },
  { name: '7', requiredNotes: [1, 5, 8, 11] },
  { name: 'maj7', requiredNotes: [1, 5, 8, 12] },
  { name: '6', requiredNotes: [1, 5, 8, 10] },
  { name: 'm', requiredNotes: [1, 4, 8] },
  { name: 'm7', requiredNotes: [1, 4, 8, 11] },
  { name: 'm/maj7', requiredNotes: [1, 4, 8, 12] },
  { name: 'm6', requiredNotes: [1, 4, 8, 10] },
  { name: 'sus2', requiredNotes: [1, 3, 8] },
  { name: 'sus4', requiredNotes: [1, 6, 8] },
  { name: '7sus2', requiredNotes: [1, 3, 8, 11] },
  { name: '7sus4', requiredNotes: [1, 6, 8, 11] },
  { name: 'dim', requiredNotes: [1, 4, 7] },
  { name: 'dim7', requiredNotes: [1, 4, 7, 10] },
  { name: 'aug', requiredNotes: [1, 5, 9] },
  { name: '5', requiredNotes: [1, 8] },
];

/** The degree TuxGuitar counts for the fifth (7 semitones above the root). */
export const FIFTH_DEGREE = 8;
const MINOR_SEVENTH_DEGREE = 11;
const MAJOR_SEVENTH_DEGREE = 12;

const TYPES_BY_NAME: ReadonlyMap<string, ChordType> = new Map(CHORD_TYPES.map((type) => [type.name, type]));

/** True for one of CHORD_TYPES' names. */
export function isChordTypeName(name: unknown): name is ChordTypeName {
  return typeof name === 'string' && TYPES_BY_NAME.has(name);
}

/** The type of that name; the major chord's for an unknown name. */
export function chordType(name: ChordTypeName): ChordType {
  return TYPES_BY_NAME.get(name) ?? CHORD_TYPES[0] ?? { name: 'M', requiredNotes: [1, 5, 8] };
}

/** Diminished, augmented and power chords take no ninth, eleventh or thirteenth (TuxGuitar disables them). */
export function canExtend(name: ChordTypeName): boolean {
  return name !== 'dim' && name !== 'dim7' && name !== 'aug' && name !== '5';
}

/** Only the power chord of the four may still alter its fifth. */
export function canAlterFifth(name: ChordTypeName): boolean {
  return canExtend(name) || name === '5';
}

/** A sixth chord's ninth is added to it (6/9), never stacked on a seventh. */
export function isSixthChord(name: ChordTypeName): boolean {
  return name === '6' || name === 'm6';
}

/**
 * The seventh a stacked ninth, eleventh or thirteenth goes with: the type's own seventh, else the minor seventh
 * (TuxGuitar always took the minor seventh, even for maj7).
 */
export function seventhDegree(name: ChordTypeName): number {
  return chordType(name).requiredNotes.includes(MAJOR_SEVENTH_DEGREE) ? MAJOR_SEVENTH_DEGREE : MINOR_SEVENTH_DEGREE;
}
