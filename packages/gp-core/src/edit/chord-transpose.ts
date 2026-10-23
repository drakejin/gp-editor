// Chord symbols and diagrams moved by a transposition. TuxGuitar's TGMeasureManager.transposeNotes moves a diagram's
// frets string by string and clears the chord's name; here the name moves with it (root and bass) and the shape keeps
// its strings, an octave the other way when the shift would leave the neck.
import type { Chord } from '../model/song';
import { type SpelledNote, mod, moveDiatonic, pitchOfSpelling, spellInKey } from './key-spelling';
import { diagramFirstFret } from './retune';

/** How a transposition moves one note a chord symbol names (its root or its bass), spelled. */
export type NoteNameMove = (note: SpelledNote) => SpelledNote;

/** A chord symbol after a transposition, and how far its root moved (undefined when the symbol names no note). */
export interface ChordNameChange {
  readonly name: string;
  readonly rootShift: number | undefined;
}

const OCTAVE = 12;
const LETTER_NAMES = 'CDEFGAB';
/** Spelled notes of a symbol sit in middle C's octave: only the letter and the alteration are written. */
const NAME_OCTAVE_STEP = 28;
/** A root at the start of the symbol, and a bass after a slash (or TuxGuitar's backslash) anywhere after it. */
const ROOT = /^([A-G])([#b♯♭]*)/;
const BASS = /([/\\]\s*)([A-G])([#b♯♭]*)/g;

function parseNote(letter: string, accidentals: string): SpelledNote {
  const alter = [...accidentals].reduce((sum, mark) => sum + (mark === '#' || mark === '♯' ? 1 : -1), 0);
  return { step: NAME_OCTAVE_STEP + LETTER_NAMES.indexOf(letter), alter };
}

function writeNote(note: SpelledNote): string {
  const letter = LETTER_NAMES[mod(note.step, LETTER_NAMES.length)] ?? '';
  return `${letter}${note.alter > 0 ? '#'.repeat(note.alter) : 'b'.repeat(-note.alter)}`;
}

/**
 * Chromatic: the note `semitones` higher, spelled as the key `keySignature` writes it (the key's own notes, naturals,
 * then sharps in sharp keys and flats in flat keys); in C, a black key keeps the symbol's side (Bb stays a flat), and a
 * natural becomes a sharp going up and a flat going down.
 */
export function chromaticNameMove(semitones: number, keySignature: number): NoteNameMove {
  return (note) => {
    const side = keySignature !== 0 ? 'key' : note.alter < 0 || (note.alter === 0 && semitones < 0) ? 'flat' : 'sharp';
    return spellInKey(pitchOfSpelling(note) + semitones, keySignature, side);
  };
}

/** Diatonic: the note `steps` letters along the key's scale, keeping its alteration; a double sharp or flat is respelled. */
export function diatonicNameMove(steps: number, keySignature: number): NoteNameMove {
  return (note) => {
    const moved = moveDiatonic(note, keySignature, steps);
    return Math.abs(moved.alter) > 1 ? spellInKey(pitchOfSpelling(moved), keySignature) : moved;
  };
}

/** The symbol with its root and bass moved ("Am7/G" → "Bm7/A"); the rest of the text is kept. */
export function transposeChordName(name: string, move: NoteNameMove): ChordNameChange {
  const root = ROOT.exec(name);
  if (root === null) {
    return { name, rootShift: undefined };
  }
  const [rootText, letter = '', accidentals = ''] = root;
  const from = parseNote(letter, accidentals);
  const to = move(from);
  const rest = name.slice(rootText.length).replace(BASS, (_match, slash: string, bassLetter: string, bassAccidentals: string) => {
    return `${slash}${writeNote(move(parseNote(bassLetter, bassAccidentals)))}`;
  });
  return { name: `${writeNote(to)}${rest}`, rootShift: pitchOfSpelling(to) - pitchOfSpelling(from) };
}

/** Shifts equal to `shift` up to octaves, within the neck either way, nearest to `shift` first. */
function octaveAlternatives(shift: number, neck: number): readonly number[] {
  const lowest = shift - OCTAVE * Math.floor((shift + neck) / OCTAVE);
  const shifts = Array.from({ length: Math.floor((neck - lowest) / OCTAVE) + 1 }, (_, i) => lowest + i * OCTAVE);
  return shifts.sort((a, b) => Math.abs(a - shift) - Math.abs(b - shift) || Math.abs(a) - Math.abs(b));
}

/**
 * The diagram's frets `shift` semitones higher on the same strings — or the same shape an octave the other way, when
 * the shift would take a string off frets 0…neck; the window follows. Undefined when no octave fits the shape.
 */
export function shiftChordDiagram(chord: Chord, shift: number, neck: number): Chord | undefined {
  const played = chord.frets.filter((fret) => fret >= 0);
  if (played.length === 0 || shift === 0) {
    return chord;
  }
  const lowest = Math.min(...played);
  const highest = Math.max(...played);
  const fitting = octaveAlternatives(shift, neck).find((candidate) => lowest + candidate >= 0 && highest + candidate <= neck);
  if (fitting === undefined) {
    return undefined;
  }
  const frets = chord.frets.map((fret) => (fret >= 0 ? fret + fitting : fret));
  return { ...chord, frets, firstFret: diagramFirstFret(frets, chord.firstFret + fitting) };
}

/**
 * The chord with its symbol moved and its diagram shifted by as much as the root moved — by `shiftWithoutRoot` when
 * the symbol names no note (the same chord when that is undefined too). Undefined when the diagram cannot move.
 */
export function transposeChord(chord: Chord, move: NoteNameMove, shiftWithoutRoot: number | undefined, neck: number): Chord | undefined {
  const { name, rootShift } = transposeChordName(chord.name, move);
  const shift = rootShift ?? shiftWithoutRoot;
  if (shift === undefined) {
    return chord;
  }
  const diagram = shiftChordDiagram(chord, shift, neck);
  return diagram === undefined ? undefined : { ...diagram, name };
}
