// A chord as TuxGuitar's chord selector picks it (TGChordSelector's lists: tonic, chord, alteration, +/−, add, /5, /9,
// /11, bass), as one value, and the notes TGChordCreatorUtil#getChords derives from it (LGPL-2.1).
import { CHORD_TYPES, type ChordTypeName, FIFTH_DEGREE, canAlterFifth, canExtend, chordType, isSixthChord, seventhDegree } from './database';

/** A degree as written, raised (+, ♯) or lowered (−, ♭): TuxGuitar's plus-minus lists. */
export type DegreeShift = 'natural' | 'sharp' | 'flat';

/** TuxGuitar's alteration list: nothing, or the ninth, eleventh or thirteenth over the chord. */
export type ChordExtension = 'none' | '9' | '11' | '13';

export interface ChordSpec {
  /** Pitch class of the root: 0 = C … 11 = B. */
  readonly root: number;
  readonly type: ChordTypeName;
  readonly extension: ChordExtension;
  /** The extension raised or lowered (C7#9, C7b13). */
  readonly extensionShift: DegreeShift;
  /** The extension is added to the chord as it is (Cadd9), not stacked on its seventh (C9). */
  readonly isAdd: boolean;
  /** The fifth raised or lowered (Cm7b5). */
  readonly fifth: DegreeShift;
  /** The ninth under a stacked eleventh or thirteenth, raised or lowered (C13b9). */
  readonly ninth: DegreeShift;
  /** The eleventh under a stacked thirteenth, raised or lowered (C13#11). */
  readonly eleventh: DegreeShift;
  /** Pitch class of the lowest note: the root, else a slash chord (C/G). */
  readonly bass: number;
}

export type ChordSpecOptions = Partial<Omit<ChordSpec, 'root' | 'type'>>;

const SHIFTS: readonly DegreeShift[] = ['natural', 'sharp', 'flat'];
const EXTENSIONS: readonly ChordExtension[] = ['none', '9', '11', '13'];
/** TuxGuitar's alteration index: 0 none, 1 ninth, 2 eleventh, 3 thirteenth. */
const EXTENSION_LEVEL: Readonly<Record<ChordExtension, number>> = { none: 0, '9': 1, '11': 2, '13': 3 };
/** Degrees of the ninth, eleventh and thirteenth (TGChordCreatorUtil#getAddNote: 2, 5 and 9 semitones, plus one). */
const EXTENSION_DEGREES: readonly number[] = [3, 6, 10];
const SEMITONES = 12;

export function pitchClass(value: number): number {
  const whole = Number.isFinite(value) ? Math.round(value) : 0;
  return ((whole % SEMITONES) + SEMITONES) % SEMITONES;
}

/** +1, −1 or 0 semitones. */
export function shiftSemitones(shift: DegreeShift): number {
  return shift === 'sharp' ? 1 : shift === 'flat' ? -1 : 0;
}

function toShift(value: unknown): DegreeShift {
  return SHIFTS.find((shift) => shift === value) ?? 'natural';
}

/**
 * The spec with what TuxGuitar's selector disables cleared: no extension on dim, aug and power chords, no add or
 * extension shift without an extension, the ninth and eleventh only under a stacked eleventh or thirteenth; a sixth
 * chord's extension is always added (C6/9).
 */
export function normalizeChordSpec(spec: ChordSpec): ChordSpec {
  const type = CHORD_TYPES.some((candidate) => candidate.name === spec.type) ? spec.type : 'M';
  const extension = canExtend(type) ? (EXTENSIONS.find((candidate) => candidate === spec.extension) ?? 'none') : 'none';
  const hasExtension = extension !== 'none';
  const isAdd = hasExtension && (spec.isAdd === true || isSixthChord(type));
  const level = isAdd ? 0 : EXTENSION_LEVEL[extension];
  return {
    root: pitchClass(spec.root),
    type,
    extension,
    extensionShift: hasExtension ? toShift(spec.extensionShift) : 'natural',
    isAdd,
    fifth: canAlterFifth(type) ? toShift(spec.fifth) : 'natural',
    ninth: level >= 2 ? toShift(spec.ninth) : 'natural',
    eleventh: level >= 3 ? toShift(spec.eleventh) : 'natural',
    bass: pitchClass(spec.bass),
  };
}

/** A normalized spec; the bass is the root unless given. */
export function buildChordSpec(root: number, type: ChordTypeName, options: ChordSpecOptions = {}): ChordSpec {
  return normalizeChordSpec({
    root,
    type,
    extension: options.extension ?? 'none',
    extensionShift: options.extensionShift ?? 'natural',
    isAdd: options.isAdd ?? false,
    fifth: options.fifth ?? 'natural',
    ninth: options.ninth ?? 'natural',
    eleventh: options.eleventh ?? 'natural',
    bass: options.bass ?? root,
  });
}

/** TuxGuitar's getAddNote: the degree of the ninth (0), eleventh (1) or thirteenth (2), raised or lowered. */
function extensionDegree(index: number, shift: DegreeShift): number {
  return (EXTENSION_DEGREES[index] ?? 0) + shiftSemitones(shift);
}

/** The notes the chord needs, as TuxGuitar counts degrees (1 = root): its type's, and those its extension adds. */
export interface ChordDegrees {
  /** The type's notes (the fifth moved by the fifth's shift), without those the extension already holds. */
  readonly required: readonly number[];
  /** Added notes: the seventh and the extension first (essential), then a thirteenth's ninth and eleventh. */
  readonly expanding: readonly number[];
}

export function chordSpecDegrees(spec: ChordSpec): ChordDegrees {
  const level = EXTENSION_LEVEL[spec.extension];
  const expanding =
    level === 0
      ? []
      : spec.isAdd
        ? [extensionDegree(level - 1, spec.extensionShift)]
        : [
            seventhDegree(spec.type),
            extensionDegree(level - 1, spec.extensionShift),
            ...[spec.ninth, spec.eleventh].slice(0, level - 1).map((shift, index) => extensionDegree(index, shift)),
          ];
  const fifth = FIFTH_DEGREE + shiftSemitones(spec.fifth);
  const required = chordType(spec.type)
    .requiredNotes.map((degree) => (degree === FIFTH_DEGREE ? fifth : degree))
    .filter((degree) => !expanding.includes(degree));
  return { required, expanding };
}

/** Pitch class of a degree over a root. */
export function degreePitchClass(root: number, degree: number): number {
  return pitchClass(root + degree - 1);
}

/** The chord's distinct pitch classes, root first (the bass of a slash chord not included). */
export function chordSpecPitchClasses(spec: ChordSpec): readonly number[] {
  const { required, expanding } = chordSpecDegrees(spec);
  return [...new Set([...required, ...expanding].map((degree) => degreePitchClass(spec.root, degree)))];
}

/** Every extension, as the selector lists them. */
export const CHORD_EXTENSIONS = EXTENSIONS;
export const DEGREE_SHIFTS = SHIFTS;
