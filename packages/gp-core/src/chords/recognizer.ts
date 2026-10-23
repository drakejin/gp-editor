// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordRecognizer#makeProposals (LGPL-2.1): the chords a set
// of frets can be named, most likely first.
import { CHORD_TYPES, type ChordType, canExtend, seventhDegree } from './database';
import { type NoteSpelling, chordName } from './naming';
import { ELEVENTH, NINTH, type Proposal, SEVENTH, THIRTEENTH, completeProposal, isFound, isNeeded, markFound, missingCount, newProposal } from './proposal';
import { type ChordSpec, DEGREE_SHIFTS, type DegreeShift, buildChordSpec, degreePitchClass, pitchClass, shiftSemitones } from './spec';

export interface ChordProposal {
  readonly spec: ChordSpec;
  readonly name: string;
  /** How fully the frets spell the chord, in percent (TuxGuitar's "(85%)"); 100 when every chord note is played. */
  readonly completeness: number;
}

export interface RecognizeOptions {
  readonly spelling?: NoteSpelling;
}

/** TuxGuitar's howManyIncompleteChords: incomplete readings kept after the first one. */
const INCOMPLETE_CHORDS = 4;
/** Readings this much more unusual than the first unusual one are dropped. */
const UNUSUAL_RANGE = 60;
const MINOR_TYPE_INDEX = CHORD_TYPES.findIndex((type) => type.name === 'm');
const POWER_TYPE_INDEX = CHORD_TYPES.findIndex((type) => type.name === '5');
const MINOR_SEVENTH_TYPE_INDEX = CHORD_TYPES.findIndex((type) => type.name === 'm7');
const ALTERED_FIFTH_GRADE = -35;
const HALF_DIMINISHED_GRADE = -10;
const FIFTH = 7;
/** Semitones of the ninth, eleventh and thirteenth over the root. */
const EXTENSION_SEMITONES: readonly number[] = [2, 5, 9];
const MIN_DONT_HAVE_GRADE = -51;

/** The pitches of the played strings (frets string 1 first, -1 = not played; anything not a fret counts as not played). */
function playedPitches(frets: readonly number[], tuning: readonly number[]): readonly number[] {
  return frets.flatMap((fret, i) => {
    const open = tuning[i];
    return open !== undefined && Number.isInteger(fret) && fret >= 0 ? [open + fret] : [];
  });
}

/** "It is more unusual the more we go down the index, except chords 5 and m" (TuxGuitar's code spared only m). */
function typeUnusualGrade(typeIndex: number): number {
  return typeIndex === MINOR_TYPE_INDEX || typeIndex === POWER_TYPE_INDEX ? 0 : -2 * typeIndex;
}

/**
 * How unusual an altered fifth makes a type. The half-diminished chord (m7b5) is as common as the minor seventh:
 * with TuxGuitar's 35 for it too, x2323x would read Dm6/B before Bm7b5.
 */
function alteredFifthGrade(typeIndex: number, shift: DegreeShift): number {
  return typeIndex === MINOR_SEVENTH_TYPE_INDEX && shift === 'flat' ? HALF_DIMINISHED_GRADE : ALTERED_FIFTH_GRADE;
}

/** The fifth is missing but a raised or lowered one is played: a reading with that fifth. */
function alteredFifth(proposal: Proposal, tonic: number): Proposal | undefined {
  const shift: DegreeShift | undefined = isNeeded(proposal, tonic + FIFTH + 1) ? 'sharp' : isNeeded(proposal, tonic + FIFTH - 1) ? 'flat' : undefined;
  if (shift === undefined) {
    return undefined;
  }
  const unusualGrade = proposal.unusualGrade + alteredFifthGrade(proposal.typeIndex, shift);
  return markFound({ ...proposal, fifth: shift, unusualGrade }, tonic + FIFTH + shiftSemitones(shift));
}

/** The type's readings over a tonic: none when no chord note is played or more than one is missing. */
function typeProposals(notes: readonly number[], tonic: number, typeIndex: number, type: ChordType): readonly Proposal[] {
  const played = type.requiredNotes.filter((degree) => notes.includes(degreePitchClass(tonic, degree)));
  if (played.length === 0) {
    return [];
  }
  const proposal = played.reduce(
    (current, degree) => markFound({ ...current, dontHaveGrade: current.dontHaveGrade + (degree === 1 ? 15 : 0) }, degreePitchClass(tonic, degree)),
    newProposal(notes, tonic, typeIndex, typeUnusualGrade(typeIndex)),
  );
  const required = type.requiredNotes.length;
  const lacksFifth = !type.name.startsWith('dim') && !type.name.startsWith('aug') && !isFound(proposal, tonic + FIFTH);
  const altered = lacksFifth ? alteredFifth(proposal, tonic) : undefined;
  const main = lacksFifth && altered === undefined ? { ...proposal, dontHaveGrade: proposal.dontHaveGrade + 30 } : proposal;
  const withMissing = (reading: Proposal, count: number): readonly Proposal[] =>
    count >= required - 1 ? [{ ...reading, dontHaveGrade: reading.dontHaveGrade - (required - count) * 50 }] : [];
  return [...(altered === undefined ? [] : withMissing(altered, played.length + 1)), ...withMissing(main, played.length)];
}

/** The bass is the lowest note; one that is no chord note and sounds only there is a slash bass. */
function withBass(proposal: Proposal, pitches: readonly number[]): Proposal {
  const bass = pitchClass(Math.min(...pitches));
  const named = { ...proposal, bass, unusualGrade: proposal.unusualGrade - (bass === proposal.tonic ? 0 : 20) };
  // TuxGuitar meant this but never ran it: its loop always met the bass a second time.
  const isOnlyInBass = pitches.filter((pitch) => pitchClass(pitch) === bass).length === 1;
  return isNeeded(named, bass) && isOnlyInBass ? markFound({ ...named, unusualGrade: named.unusualGrade - 20 }, bass) : named;
}

/** One unnamed note as a thirteenth, eleventh or ninth with the shift. */
function nameExtension(proposal: Proposal, index: number, shift: DegreeShift): Proposal {
  const pc = pitchClass(proposal.tonic + (EXTENSION_SEMITONES[index] ?? 0) + shiftSemitones(shift));
  if (!isNeeded(proposal, pc) || proposal.filled[index] === true) {
    return proposal;
  }
  const filled = proposal.filled.map((value, i) => i === index || value);
  const extensionShifts = proposal.extensionShifts.map((value, i) => (i === index ? shift : value));
  return markFound({ ...proposal, filled, extensionShifts, unusualGrade: proposal.unusualGrade - (shift === 'natural' ? 0 : 15) }, pc);
}

/** The notes still unnamed: the seventh, then thirteenths, elevenths and ninths — natural, raised, then lowered. */
function withExtensions(proposal: Proposal): Proposal {
  const type = CHORD_TYPES[proposal.typeIndex];
  if (missingCount(proposal) === 0 || type === undefined || !canExtend(type.name)) {
    return proposal;
  }
  const seventh = degreePitchClass(proposal.tonic, seventhDegree(type.name));
  const withSeventh =
    proposal.notes.includes(seventh) && !isFound(proposal, seventh)
      ? markFound({ ...proposal, filled: proposal.filled.map((value, i) => i === SEVENTH || value) }, seventh)
      : proposal;
  return DEGREE_SHIFTS.reduce(
    (current, shift) => [THIRTEENTH, ELEVENTH, NINTH].reduce((inner, index) => nameExtension(inner, index, shift), current),
    withSeventh,
  );
}

/** Every played note named, not too incomplete, and not a bare seventh named as an added note. */
function isWhole(proposal: Proposal): boolean {
  const isOnlySeventh = proposal.filled[SEVENTH] === true && !proposal.filled.slice(0, SEVENTH).some(Boolean);
  return missingCount(proposal) === 0 && proposal.dontHaveGrade > MIN_DONT_HAVE_GRADE && !isOnlySeventh;
}

/**
 * The first few incomplete readings are kept, then they go by how usual they are and how complete (TuxGuitar: only how
 * usual, which put Dadd9 without its third before Dsus2 for xx0230); very unusual ones are dropped.
 */
function rank(proposals: readonly Proposal[]): readonly Proposal[] {
  const sorted = [...proposals].sort((a, b) => b.dontHaveGrade - a.dontHaveGrade);
  const firstIncomplete = sorted.findIndex((proposal) => proposal.dontHaveGrade < 0);
  const kept = firstIncomplete < 0 ? sorted : sorted.slice(0, firstIncomplete + INCOMPLETE_CHORDS);
  const score = (proposal: Proposal) => proposal.unusualGrade + proposal.dontHaveGrade;
  const usual = kept.sort((a, b) => score(b) - score(a) || b.unusualGrade - a.unusualGrade);
  const floor = (usual.find((proposal) => proposal.unusualGrade < 0)?.unusualGrade ?? 0) - UNUSUAL_RANGE;
  return usual.filter((proposal) => proposal.unusualGrade > floor);
}

function toChordProposal(proposal: Proposal, spelling: NoteSpelling | undefined): ChordProposal {
  const type = CHORD_TYPES[proposal.typeIndex]?.name ?? 'M';
  const spec = buildChordSpec(proposal.tonic, type, { ...proposal.named, fifth: proposal.fifth, bass: proposal.bass });
  return { spec, name: chordName(spec, spelling), completeness: Math.round(100 + (proposal.dontHaveGrade * 7) / 10) };
}

/**
 * Every chord the frets (string 1 first, -1 = not played) can be named on the tuning (open-string pitches, string 1
 * first), most likely first, each name once. Every played note belongs to the name; at most one chord note is missing.
 */
export function recognizeChord(frets: readonly number[], tuning: readonly number[], options: RecognizeOptions = {}): readonly ChordProposal[] {
  const pitches = playedPitches(frets, tuning);
  if (pitches.length === 0) {
    return [];
  }
  const notes = [...new Set(pitches.map(pitchClass))];
  const readings = Array.from({ length: 12 }, (_, tonic) => CHORD_TYPES.flatMap((type, typeIndex) => typeProposals(notes, tonic, typeIndex, type))).flat();
  const named = readings.map((reading) => withExtensions(withBass(reading, pitches))).filter(isWhole).map(completeProposal);
  return rank(named)
    .map((proposal) => toChordProposal(proposal, options.spelling))
    .filter((proposal, index, all) => all.findIndex((other) => other.name === proposal.name) === index);
}
