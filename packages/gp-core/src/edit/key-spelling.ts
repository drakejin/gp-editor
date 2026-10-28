/**
 * Notes spelled in a key signature (-7 flats … 7 sharps): letters and alterations, steps along the key's scale, and
 * key signatures moved by semitones. The model holds a key as its accidentals only, so a major key and its relative
 * minor (C major, A minor) share one scale here: the minor's raised 6th and 7th are altered degrees.
 */

/** A pitch as written: its letter step (octave * 7 + letter, C = 0 … B = 6; middle C, MIDI 60, is 28) and alteration. */
export interface SpelledNote {
  readonly step: number;
  /** Semitones from the natural letter: -1 flat, 1 sharp (-2 / 2 double). */
  readonly alter: number;
}

/** How a black key that is not in the key is written: by the key (sharps in sharp keys and C), or as asked. */
export type BlackKeySpelling = 'key' | 'sharp' | 'flat';

/** The natural notes' letters, C … B: a letter is counted by its index here (0 = C … 6 = B). */
export const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const OCTAVE = 12;
const LETTERS = NOTE_LETTERS.length;
const MAX_KEY_ACCIDENTALS = 7;
/** Pitch class of each letter, C … B. */
const LETTER_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** Letters in the order a key signature adds sharps (F C G D A E B) and flats (B E A D G C F). */
const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [6, 2, 5, 1, 4, 0, 3];
/** A fifth up, in semitones: one more sharp (or one flat fewer) in the key signature. */
const FIFTH = 7;
/** Accidentals of the two spellings of the key a tritone from C (F# major, G flat major). */
const TRITONE_KEY = 6;

/** The pitch class of a natural note named by its capital letter (C = 0 … B = 11); undefined for any other text. */
export function letterPitchClass(letter: string | undefined): number | undefined {
  const index = NOTE_LETTERS.findIndex((name) => name === letter);
  return index < 0 ? undefined : LETTER_PITCH_CLASSES[index];
}

export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function isKeySignature(keySignature: number): boolean {
  return Number.isInteger(keySignature) && Math.abs(keySignature) <= MAX_KEY_ACCIDENTALS;
}

/** The alteration a key signature gives a letter (0 = C … 6 = B); 0 for a key signature out of range. */
function keyAlteration(letter: number, keySignature: number): number {
  if (!isKeySignature(keySignature)) {
    return 0;
  }
  if (keySignature > 0) {
    return SHARP_ORDER.indexOf(letter) < keySignature ? 1 : 0;
  }
  return keySignature < 0 && FLAT_ORDER.indexOf(letter) < -keySignature ? -1 : 0;
}

function spelled(pitch: number, letter: number, alter: number): SpelledNote {
  return { step: (Math.floor((pitch - alter) / OCTAVE) - 1) * LETTERS + letter, alter };
}

/**
 * Letter and alteration of a MIDI pitch in a key, as the score writes it: the key's own spelling for notes of the key
 * (E# in F# major), naturals for other white keys, and for other black keys sharps in sharp keys and C, flats in flat
 * keys — or the side `blackKeys` asks for.
 */
export function spellInKey(pitch: number, keySignature: number, blackKeys: BlackKeySpelling = 'key'): SpelledNote {
  for (let letter = 0; letter < LETTERS; letter++) {
    const alter = keyAlteration(letter, keySignature);
    if (mod(pitch - alter, OCTAVE) === LETTER_PITCH_CLASSES[letter]) {
      return spelled(pitch, letter, alter);
    }
  }
  const whiteLetter = LETTER_PITCH_CLASSES.indexOf(mod(pitch, OCTAVE));
  if (whiteLetter >= 0) {
    return spelled(pitch, whiteLetter, 0);
  }
  const isFlat = blackKeys === 'key' ? keySignature < 0 : blackKeys === 'flat';
  const alter = isFlat ? -1 : 1;
  return spelled(pitch, LETTER_PITCH_CLASSES.indexOf(mod(pitch - alter, OCTAVE)), alter);
}

/** The MIDI pitch a spelling stands for. */
export function pitchOfSpelling(note: SpelledNote): number {
  const octave = Math.floor(note.step / LETTERS);
  return (octave + 1) * OCTAVE + (LETTER_PITCH_CLASSES[mod(note.step, LETTERS)] ?? 0) + note.alter;
}

/**
 * The note `steps` letters further along the key's scale (negative: down). An altered note keeps its alteration
 * against the key: a raised degree stays raised (F# in C major up a step is G#), a lowered one lowered.
 */
export function moveDiatonic(note: SpelledNote, keySignature: number, steps: number): SpelledNote {
  const fromKey = note.alter - keyAlteration(mod(note.step, LETTERS), keySignature);
  const step = note.step + steps;
  return { step, alter: keyAlteration(mod(step, LETTERS), keySignature) + fromKey };
}

/** shiftDiatonic on a MIDI pitch: its spelling in the key, moved `steps` along the scale, as a pitch again. */
export function shiftDiatonic(pitch: number, keySignature: number, steps: number): number {
  return pitchOfSpelling(moveDiatonic(spellInKey(pitch, keySignature), keySignature, steps));
}

/**
 * The key signature `semitones` higher (negative: lower), written with the fewer accidentals (D flat major, not C#);
 * at six either way the key keeps its side (F → G flat, G → F#), and C goes by the direction (up: F#, down: G flat).
 * A key signature that is not a whole number from -7 to 7 is returned as it is.
 */
export function transposeKeySignature(keySignature: number, semitones: number): number {
  if (!isKeySignature(keySignature) || !Number.isInteger(semitones)) {
    return keySignature;
  }
  const sharps = mod(keySignature + FIFTH * semitones, OCTAVE);
  if (sharps !== TRITONE_KEY) {
    return sharps < TRITONE_KEY ? sharps : sharps - OCTAVE;
  }
  const isFlatSide = keySignature === 0 ? semitones < 0 : keySignature < 0;
  return isFlatSide ? -TRITONE_KEY : TRITONE_KEY;
}

/** A key's mode: the major key of a key signature or its relative minor. */
export type KeyMode = 'major' | 'minor';

/** A key's tonic: its letter (C = 0 … B = 6) and alteration (-1 flat, 1 sharp). */
export interface KeyTonic {
  readonly letter: number;
  readonly alter: number;
}

/** Key signatures of the major keys on the natural letters, C … B. */
const LETTER_MAJOR_KEYS: readonly number[] = [0, 2, 4, -1, 1, 3, 5];
/** A minor key has three sharps fewer (flats more) than the major key on its tonic (A major, A minor). */
const MINOR_SHIFT = 3;
/** Letters from the tonic of a major key to its relative minor's (C → A). */
const MINOR_LETTER_STEP = 5;
/** A fifth is four letter steps (C → G): one sharp more steps the major tonic four letters on. */
const FIFTH_LETTERS = 4;

/** The key signature of the key on a tonic (letter and alteration) in a mode; undefined beyond seven accidentals. */
export function keySignatureOf(letter: number, alter: number, mode: KeyMode): number | undefined {
  const major = LETTER_MAJOR_KEYS[letter];
  if (major === undefined || !Number.isInteger(alter)) {
    return undefined;
  }
  const keySignature = major + FIFTH * alter - (mode === 'minor' ? MINOR_SHIFT : 0);
  return isKeySignature(keySignature) ? keySignature : undefined;
}

/** The tonic of a key signature's major key or relative minor (6 sharps: F# major, D# minor); keySignatureOf's inverse. */
export function keyTonic(keySignature: number, mode: KeyMode): KeyTonic {
  const letter = mod(keySignature * FIFTH_LETTERS + (mode === 'minor' ? MINOR_LETTER_STEP : 0), LETTERS);
  return { letter, alter: keyAlteration(letter, keySignature) };
}
