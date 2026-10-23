// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordRecognizer.Proposal and #findChordLogic (LGPL-2.1):
// one reading of a set of notes as a chord, built up as its notes are named.
import type { ChordExtension, DegreeShift } from './spec';
import { pitchClass } from './spec';

/** The ninth, eleventh, thirteenth and seventh, as TuxGuitar's `filled` flags count them. */
export const NINTH = 0;
export const ELEVENTH = 1;
export const THIRTEENTH = 2;
export const SEVENTH = 3;

/** What the extension makes of the chord, once every note is named. */
export interface NamedExtension {
  readonly extension: ChordExtension;
  readonly extensionShift: DegreeShift;
  readonly isAdd: boolean;
  readonly ninth: DegreeShift;
  readonly eleventh: DegreeShift;
}

export interface Proposal {
  readonly tonic: number;
  /** Index into CHORD_TYPES. */
  readonly typeIndex: number;
  /** The distinct pitch classes played. */
  readonly notes: readonly number[];
  /** Those named so far. */
  readonly found: ReadonlySet<number>;
  /** How unusual the name is: Cm is more usual than E7/9+/C. */
  readonly unusualGrade: number;
  /** Penalty for chord notes that are not played. */
  readonly dontHaveGrade: number;
  readonly fifth: DegreeShift;
  readonly bass: number;
  /** Ninth, eleventh, thirteenth and seventh named as added notes. */
  readonly filled: readonly boolean[];
  /** How the ninth, eleventh and thirteenth were named. */
  readonly extensionShifts: readonly DegreeShift[];
  readonly named: NamedExtension;
}

const NO_EXTENSION: NamedExtension = { extension: 'none', extensionShift: 'natural', isAdd: false, ninth: 'natural', eleventh: 'natural' };

export function newProposal(notes: readonly number[], tonic: number, typeIndex: number, unusualGrade: number): Proposal {
  return {
    tonic,
    typeIndex,
    notes,
    found: new Set(),
    unusualGrade,
    dontHaveGrade: -15,
    fifth: 'natural',
    bass: tonic,
    filled: [false, false, false, false],
    extensionShifts: ['natural', 'natural', 'natural'],
    named: NO_EXTENSION,
  };
}

/** Notes played but not named yet. */
export function missingCount(proposal: Proposal): number {
  return proposal.notes.length - proposal.found.size;
}

export function isFound(proposal: Proposal, value: number): boolean {
  return proposal.found.has(pitchClass(value));
}

/** Played and not named yet. */
export function isNeeded(proposal: Proposal, value: number): boolean {
  const pc = pitchClass(value);
  return proposal.notes.includes(pc) && !proposal.found.has(pc);
}

export function markFound(proposal: Proposal, value: number): Proposal {
  return isNeeded(proposal, value) ? { ...proposal, found: new Set([...proposal.found, pitchClass(value)]) } : proposal;
}

function grade(proposal: Proposal, unusual: number, dontHave: number): Proposal {
  return { ...proposal, unusualGrade: proposal.unusualGrade + unusual, dontHaveGrade: proposal.dontHaveGrade + dontHave };
}

/** A thirteenth: added when neither seventh, ninth nor eleventh is there; graded down for each one missing. */
function thirteenth(proposal: Proposal): Proposal {
  const [ninth = false, eleventh = false, , seventh = false] = proposal.filled;
  const [ninthShift = 'natural', eleventhShift = 'natural', shift = 'natural'] = proposal.extensionShifts;
  const named: NamedExtension = { extension: '13', extensionShift: shift, isAdd: false, ninth: ninthShift, eleventh: eleventhShift };
  if (ninth && eleventh && seventh) {
    return { ...proposal, named };
  }
  const missing = grade(proposal, -10, 0);
  if (!ninth && !eleventh && !seventh) {
    return { ...missing, named: { ...named, isAdd: true } };
  }
  const graded = grade(grade(grade(missing, 0, seventh ? 0 : -25), eleventh ? 0 : -30, eleventh ? 0 : -10), ninth ? 0 : -30, ninth ? 0 : -10);
  return { ...graded, named };
}

/** An eleventh: added when neither seventh nor ninth is there. */
function eleventh(proposal: Proposal): Proposal {
  const [ninth = false, , , seventh = false] = proposal.filled;
  const [ninthShift = 'natural', shift = 'natural'] = proposal.extensionShifts;
  const named: NamedExtension = { extension: '11', extensionShift: shift, isAdd: false, ninth: ninthShift, eleventh: 'natural' };
  const graded = grade(proposal, -10, 0);
  if (ninth && seventh) {
    return { ...graded, named };
  }
  if (!ninth && !seventh) {
    return { ...graded, named: { ...named, isAdd: true } };
  }
  return { ...grade(grade(graded, 0, seventh ? 0 : -25), ninth ? 0 : -30, ninth ? 0 : -10), named };
}

/** findChordLogic: the extension the named added notes make (13, 11 or 9; added without the seventh). */
export function completeProposal(proposal: Proposal): Proposal {
  const { filled, extensionShifts } = proposal;
  if (filled[THIRTEENTH] === true) {
    return thirteenth(proposal);
  }
  if (filled[ELEVENTH] === true) {
    return eleventh(proposal);
  }
  if (filled[NINTH] === true) {
    const named: NamedExtension = { ...NO_EXTENSION, extension: '9', extensionShift: extensionShifts[NINTH] ?? 'natural', isAdd: filled[SEVENTH] !== true };
    return { ...grade(proposal, -10, 0), named };
  }
  return proposal;
}
