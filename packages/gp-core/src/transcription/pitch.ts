import { lookupName } from '../formats/gpif/xml';

const SEMITONES_PER_OCTAVE = 12;
const MAX_MIDI_PITCH = 127;

/** Semitones of each natural note above C. */
const LETTER_SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Accidentals as written in text or with music symbols. */
const ACCIDENTAL_SEMITONES: Readonly<Record<string, number>> = {
  '': 0,
  '♮': 0,
  '#': 1,
  '♯': 1,
  x: 2,
  '##': 2,
  '♯♯': 2,
  '𝄪': 2,
  b: -1,
  '♭': -1,
  bb: -2,
  '♭♭': -2,
  '𝄫': -2,
};

/** Letter, accidental, octave −1…9 (scientific pitch notation). */
const PITCH_PATTERN = /^([A-Ga-g])([^\d-]*)(-1|\d)$/;

/**
 * MIDI pitch of a note in scientific pitch notation ("C4" = 60, "C#4", "Bb3", "F♯2", "Cx4", "Dbb4"); undefined when the
 * text is not one or the pitch falls outside MIDI's 0…127.
 */
export function parsePitch(text: string): number | undefined {
  const match = PITCH_PATTERN.exec(text.trim());
  const letter = lookupName(LETTER_SEMITONES, match?.[1]?.toUpperCase());
  const accidental = lookupName(ACCIDENTAL_SEMITONES, match?.[2]);
  if (match === null || letter === undefined || accidental === undefined) {
    return undefined;
  }
  const octave = Number(match[3]);
  const pitch = (octave + 1) * SEMITONES_PER_OCTAVE + letter + accidental;
  return pitch >= 0 && pitch <= MAX_MIDI_PITCH ? pitch : undefined;
}
