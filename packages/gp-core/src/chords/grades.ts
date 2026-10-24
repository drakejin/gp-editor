// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordCreatorUtil#determinePriority and TGChordSettings
// (LGPL-2.1): how good one voicing of a chord is.
import { degreePitchClass, pitchClass } from './spec';

/** TGChordSettings' chord types: plain, inversions (another note in the bass), close or open voicings. */
export type VoicingStyle = 'normal' | 'inversions' | 'closeVoiced' | 'openVoiced';

export interface ChordGrades {
  readonly bass: number;
  readonly fingering: number;
  readonly subsequent: number;
  readonly requiredBasics: number;
  readonly manyStrings: number;
  readonly goodChordSemantics: number;
  /** Per fret of the hand's position (not in TuxGuitar). */
  readonly position: number;
}

const POSITION_GRADE = 6;

/** TGChordSettings#setChordTypeIndex. */
export const VOICING_GRADES: Readonly<Record<VoicingStyle, ChordGrades>> = {
  normal: { bass: 200, fingering: 150, subsequent: 200, requiredBasics: 150, manyStrings: 100, goodChordSemantics: 200, position: POSITION_GRADE },
  inversions: { bass: -100, fingering: 150, subsequent: 200, requiredBasics: 150, manyStrings: 50, goodChordSemantics: 200, position: POSITION_GRADE },
  closeVoiced: { bass: 50, fingering: 200, subsequent: 350, requiredBasics: 150, manyStrings: -100, goodChordSemantics: 200, position: POSITION_GRADE },
  openVoiced: { bass: 100, fingering: 100, subsequent: -80, requiredBasics: 100, manyStrings: -80, goodChordSemantics: 200, position: POSITION_GRADE },
};

/** What a string's note is to the chord: a required note's index (0 = root), or one of these. */
export const BASS_ROLE = -1;
/** The seventh or the extension. */
export const ESSENTIAL_ROLE = -2;
/** A thirteenth's ninth or eleventh. */
export const NOT_ESSENTIAL_ROLE = -3;

/** One played string of a voicing (TuxGuitar's StringValue); strings count from the lowest, 0. */
export interface StringValue {
  readonly string: number;
  readonly fret: number;
  readonly role: number;
}

export interface VoicingContext {
  /** Open-string pitches, lowest string first. */
  readonly tuning: readonly number[];
  readonly root: number;
  readonly bass: number;
  /** Degrees, as ChordDegrees. */
  readonly required: readonly number[];
  readonly expanding: readonly number[];
  /** TuxGuitar's alteration index: 0 none, 1 ninth, 2 eleventh, 3 thirteenth. */
  readonly extensionLevel: number;
  readonly isSus: boolean;
  readonly isFifthAltered: boolean;
  readonly grades: ChordGrades;
  /** TGChordSettings.emptyStringChords: open strings do not count in the fret span. */
  readonly preferOpenStrings: boolean;
  readonly maxFret: number;
}

const FIFTH_SEMITONES = 7;
const PERFECT_OCTAVE_LESS_ONE = 11;

const pitchOf = (value: StringValue, context: VoicingContext): number => (context.tuning[value.string] ?? 0) + value.fret;

/**
 * The notes from the lowest pitch up (string order breaks ties). TuxGuitar goes by string, lowest string first: the
 * same on a guitar, but a re-entrant tuning (ukulele) has its lowest note on an inner string.
 */
function byPitch(combination: readonly StringValue[], context: VoicingContext): readonly StringValue[] {
  return [...combination].sort((a, b) => pitchOf(a, context) - pitchOf(b, context) || a.string - b.string);
}

/** Points for having all the chord's own notes; a sus chord may miss its fifth for a small penalty. */
function requiredNotesGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const grade = context.grades.requiredBasics;
  const found = new Set(combination.filter((value) => value.role >= 0).map((value) => value.role)).size;
  if (found === context.required.length) {
    return grade;
  }
  if (found === context.required.length - 1) {
    const fifth = pitchClass(context.root + FIFTH_SEMITONES);
    const hasFifth = combination.some((value) => pitchClass(pitchOf(value, context)) === fifth);
    if (!hasFifth && context.isSus && context.required.length !== 2 && !context.isFifthAltered) {
      return (grade * 4) / 5;
    }
  }
  const noteCount = (context.extensionLevel === 0 ? 0 : 1 + context.extensionLevel) + found + (context.bass === context.root ? 0 : 1);
  return ((-grade * (context.tuning.length - noteCount)) / context.tuning.length) * 2;
}

/** Points for strings in a row, a penalty for a skipped string. */
function subsequentStringsGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const strings = combination.map((value) => value.string);
  const span = Math.max(...strings) - Math.min(...strings) + 1;
  return new Set(strings).size === span ? context.grades.subsequent : -context.grades.subsequent;
}

/** Points when the lowest note is the bass the chord asks for. */
function bassGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const lowest = byPitch(combination, context)[0];
  if (lowest === undefined) {
    return 0;
  }
  return pitchClass(pitchOf(lowest, context)) === context.bass ? context.grades.bass : -context.grades.bass;
}

/** Not in TuxGuitar: a voicing low on the neck comes first, as chord books list them (open C before the 8th-fret barre). */
function positionGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const fretted = combination.filter((value) => value.fret > 0).map((value) => value.fret);
  return fretted.length === 0 ? 0 : -context.grades.position * Math.min(...fretted);
}

/** More strings are better with a positive grade, fewer with a negative one. */
function manyStringsGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const grade = context.grades.manyStrings;
  return (grade / 3) * (combination.length - context.tuning.length / (grade > 0 ? 2 : 1.2));
}

/** Points for a narrow hand: a short span, few fingers, a finger that can bar. */
function fingeringGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const grade = context.grades.fingering;
  const positions = context.tuning.map((_, string) => combination.find((value) => value.string === string)?.fret ?? -1);
  const fretted = positions.filter((fret) => fret > 0);
  const min = fretted.length > 0 ? Math.min(...fretted) : context.maxFret + 2;
  const max = Math.max(0, ...positions);
  const maxCount = positions.filter((fret) => fret === max).length;
  const hasOpenString = positions.includes(0);
  const canBar = hasOpenString || positions.filter((fret) => fret === min).length >= 2;
  return (canBar ? grade / 8 : 0) + spreadGrade(Math.abs(max - min), min, maxCount, grade) + fingersGrade(positions, min, grade);
}

/** Fret span: 1–2 nice, 3 good, 4 bad, 5 a disaster; worse low on the neck, where frets are wide. */
function spreadGrade(span: number, min: number, maxCount: number, grade: number): number {
  switch (span) {
    case 0:
      return grade / 5;
    case 1:
      return grade / (5 + maxCount);
    case 2:
      return (grade / (6 + maxCount)) * (min < 5 ? 0.9 : 1);
    case 3:
      return (-grade / 10) * maxCount * (min < 5 ? 1.3 : 1);
    case 4:
      return (-grade / 4) * maxCount * (min <= 5 ? 1.8 : 1);
    default:
      return -grade * maxCount;
  }
}

/** The index finger bars the lowest fret (above the last open string); every other fretted note takes a finger. */
function fingersGrade(positions: readonly number[], min: number, grade: number): number {
  const lastOpen = Math.max(0, positions.lastIndexOf(0));
  const fingers = 1 + positions.filter((fret, string) => fret > 0 && !(string >= lastOpen && fret === min)).length;
  return fingers > 4 ? -grade : grade * 0.1 * (15 - 2 * fingers);
}

/**
 * Points for theory: no extension below the root or within its octave, no slash bass above the bass, and every
 * extension present (the essential ones at least).
 */
function semanticsGrade(combination: readonly StringValue[], context: VoicingContext): number {
  const grade = context.grades.goodChordSemantics;
  const ordered = byPitch(combination, context);
  const tonicIndex = ordered.findIndex((value) => value.role === 0);
  const tonic = tonicIndex < 0 ? undefined : pitchOf(ordered[tonicIndex] as StringValue, context);
  const upper = ordered.slice(1);
  const placement = upper.reduce((sum, value, index) => {
    const bassPenalty = value.role === BASS_ROLE ? -grade : 0;
    if (value.role >= 0) {
      return sum;
    }
    const isBeforeTonic = tonic === undefined || tonicIndex > index + 1;
    const isLow = !isBeforeTonic && (tonic ?? 0) + PERFECT_OCTAVE_LESS_ONE > pitchOf(value, context);
    return sum + bassPenalty + (isBeforeTonic ? -grade / 2 : isLow ? -grade / 3 : 0);
  }, 0);
  return placement + (context.extensionLevel === 0 ? 0 : extensionsGrade(upper, context));
}

function extensionsGrade(upper: readonly StringValue[], context: VoicingContext): number {
  const grade = context.grades.goodChordSemantics;
  const found = context.expanding.map((degree) => {
    const target = degreePitchClass(context.root, degree);
    return upper.find((value) => value.role < 0 && pitchClass(pitchOf(value, context)) === target)?.role ?? 0;
  });
  const essentials = found.filter((role) => role === ESSENTIAL_ROLE).length;
  const others = found.filter((role) => role !== 0 && role !== ESSENTIAL_ROLE).length;
  if (essentials + others === context.expanding.length) {
    return grade;
  }
  if (essentials === 2) {
    return grade / 2;
  }
  return (essentials + others - context.expanding.length) * grade + (others * grade) / 2;
}

/** TuxGuitar's priority of a voicing: the sum of its grades. */
export function voicingPriority(combination: readonly StringValue[], context: VoicingContext): number {
  return (
    requiredNotesGrade(combination, context) +
    semanticsGrade(combination, context) +
    subsequentStringsGrade(combination, context) +
    bassGrade(combination, context) +
    manyStringsGrade(combination, context) +
    fingeringGrade(combination, context) +
    positionGrade(combination, context)
  );
}
