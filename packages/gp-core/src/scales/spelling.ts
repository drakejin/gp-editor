// Port of TuxGuitar's TGMusicKeyUtils (getKeySignature(TGScale), noteName, noteAccidental) (LGPL-2.1): a scale's note names.
import { NOTE_LETTERS } from '../edit/key-spelling';
import { type ScaleChoice, SCALE_ROOTS, scalePitchClasses } from './notes';

/**
 * Key signatures are numbered as in TuxGuitar here: 0 = none, 1–7 = 1–7 sharps, 8–14 = 1–7 flats. A note's index is
 * its letter, 0 = C … 6 = B.
 */
const SHARP_INDEXES = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const SIX_SHARP_INDEXES = [0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6]; // E#
const SEVEN_SHARP_INDEXES = [6, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6]; // E#, B#
const FLAT_INDEXES = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const SIX_FLAT_INDEXES = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 0]; // Cb
const SEVEN_FLAT_INDEXES = [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 0]; // Cb, Fb
const INDEX_TABLES = [SHARP_INDEXES, SIX_SHARP_INDEXES, SEVEN_SHARP_INDEXES, FLAT_INDEXES, SIX_FLAT_INDEXES, SEVEN_FLAT_INDEXES];
/** Which index table each key signature uses. */
const TABLE_OF_SIGNATURE = [0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 4, 5];
/** Letters in the order sharps are added: F C G D A E B (flats: the other way round). */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const ONE_FLAT = 8;
const LAST_SIGNATURE = 14;

type Alteration = 'natural' | 'sharp' | 'flat';

function noteIndex(pitchClass: number, signature: number): number {
  return INDEX_TABLES[TABLE_OF_SIGNATURE[signature] ?? 0]?.[pitchClass] ?? 0;
}

function noteAlteration(pitchClass: number, signature: number): Alteration {
  const index = noteIndex(pitchClass, signature);
  if ((7 + noteIndex(pitchClass, ONE_FLAT) - index) % 7 === 1) {
    return 'sharp';
  }
  return (7 + noteIndex(pitchClass, 0) - index) % 7 === 6 ? 'flat' : 'natural';
}

/** The alteration the key signature gives a letter. */
function letterAlteration(index: number, signature: number): Alteration {
  if (signature <= 7) {
    return SHARP_ORDER.slice(0, signature).includes(index) ? 'sharp' : 'natural';
  }
  return SHARP_ORDER.slice(LAST_SIGNATURE - signature).includes(index) ? 'flat' : 'natural';
}

function noteName(pitchClass: number, signature: number): string {
  const alteration = noteAlteration(pitchClass, signature);
  return `${NOTE_LETTERS[noteIndex(pitchClass, signature)] ?? ''}${alteration === 'sharp' ? '#' : alteration === 'flat' ? 'b' : ''}`;
}

/**
 * Notes that need an accidental in the key signature (getNbAccidentals); undefined when the signature does not fit:
 * a sharp root under flats or the other way round, or two notes on one letter.
 */
function accidentalCount(choice: ScaleChoice, signature: number): number | undefined {
  const alteration = SCALE_ROOTS[choice.rootIndex]?.alteration;
  if ((alteration === 'sharp' && signature > 7) || (alteration === 'flat' && signature <= 7)) {
    return undefined;
  }
  const pitchClasses = scalePitchClasses(choice);
  const letters = new Set(pitchClasses.map((pitchClass) => noteIndex(pitchClass, signature)));
  if (letters.size < pitchClasses.length) {
    return undefined;
  }
  return pitchClasses.filter((pitchClass) => noteAlteration(pitchClass, signature) !== letterAlteration(noteIndex(pitchClass, signature), signature)).length;
}

/** TGMusicKeyUtils#getKeySignature(TGScale): the signature with the fewest accidentals; undefined when none fits. */
function fittingSignature(choice: ScaleChoice): number | undefined {
  if (accidentalCount(choice, 0) === 0) {
    return 0;
  }
  let best: number | undefined;
  let fewest = 8;
  for (let count = 7; count > 0; count--) {
    for (const signature of [count + 7, count]) {
      const accidentals = accidentalCount(choice, signature);
      if (accidentals !== undefined && accidentals <= fewest) {
        fewest = accidentals;
        best = signature;
      }
    }
  }
  return best;
}

/** The signature the names are spelled in: TuxGuitar's, else plain sharps, or plain flats for a flat root. */
function spellingSignature(choice: ScaleChoice): number {
  return fittingSignature(choice) ?? (SCALE_ROOTS[choice.rootIndex]?.alteration === 'flat' ? ONE_FLAT : 0);
}

/** The scale's note names from the root up, spelled in its key signature ("Eb F G Ab Bb C D"); none without a scale. */
export function scaleNoteNames(choice: ScaleChoice): readonly string[] {
  const signature = spellingSignature(choice);
  return scalePitchClasses(choice).map((pitchClass) => noteName(pitchClass, signature));
}

/** The scale's key signature as the model counts it (`Measure.keySignature`): sharps positive, flats negative, 0 for none. */
export function scaleKeySignature(choice: ScaleChoice): number {
  const signature = fittingSignature(choice) ?? 0;
  return signature > 7 ? 7 - signature : signature;
}

/** How hard a spelling reads: its sharps and flats, and more than any when no key signature fits it. */
function spellingCost(choice: ScaleChoice): number {
  const altered = scaleNoteNames(choice).filter((name) => name.length > 1).length;
  return fittingSignature(choice) === undefined ? altered + 12 : altered;
}

/** The choice for a scale on a pitch class, its root named the way that needs fewer sharps and flats (Db major, not C#). */
export function preferredScaleChoice(pitchClass: number, scaleIndex: number): ScaleChoice {
  const choices = SCALE_ROOTS.flatMap((root, rootIndex) => (root.pitchClass === pitchClass ? [{ rootIndex, scaleIndex }] : []));
  return choices.reduce((best, choice) => (spellingCost(choice) < spellingCost(best) ? choice : best), choices[0] ?? { rootIndex: 0, scaleIndex });
}
