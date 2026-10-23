// Port of TuxGuitar app.tuxguitar.util.TGMusicKeyUtils (noteShortName, noteAlteration, noteOctave; LGPL-2.1): how a MIDI pitch is spelled in a key.

/** A spelled pitch: MusicXML's step, alter and octave. */
export interface SpelledPitch {
  readonly step: string;
  /** -1 flat, 0 natural, 1 sharp. */
  readonly alter: -1 | 0 | 1;
  readonly octave: number;
}

const SEMITONES_PER_OCTAVE = 12;
/** MusicXML octaves run 0…9 (C0 = MIDI 12; TGMusicKeyUtils.MIN_MIDI_NOTE / MAX_MIDI_NOTE). */
const MIN_SPELLED_PITCH = 12;
const MAX_SPELLED_PITCH = 127;

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const B_INDEX = 6;
const C_INDEX = 0;

// Step index per pitch class, by the key's accidentals (TGMusicKeyUtils.indexesSharp … indexes7Flat).
const INDEXES_SHARP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const INDEXES_6_SHARP = [0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6];
const INDEXES_7_SHARP = [6, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6];
const INDEXES_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const INDEXES_6_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 0];
const INDEXES_7_FLAT = [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 0];
const TABLE_INDEX = [INDEXES_SHARP, INDEXES_6_SHARP, INDEXES_7_SHARP, INDEXES_FLAT, INDEXES_6_FLAT, INDEXES_7_FLAT];
/** TuxGuitar key (0…7 sharps, 8…14 = 1…7 flats) → TABLE_INDEX. */
const INDEX_KEY_SIGNATURE = [0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 4, 5];

const TG_ONE_FLAT = 8;
const TG_SEVEN_SHARPS = 7;
const TG_SIX_FLATS = 13;
const MAX_ACCIDENTALS = 7;

/** The model's key (-7 … 7, flats negative) as TuxGuitar's 0…14. */
function toTgKey(keySignature: number): number {
  const key = Math.max(-MAX_ACCIDENTALS, Math.min(MAX_ACCIDENTALS, Math.trunc(keySignature)));
  return key >= 0 ? key : MAX_ACCIDENTALS - key;
}

function noteIndex(pitch: number, tgKey: number): number {
  return TABLE_INDEX[INDEX_KEY_SIGNATURE[tgKey] ?? 0]?.[pitch % SEMITONES_PER_OCTAVE] ?? 0;
}

function noteAlteration(pitch: number, tgKey: number): SpelledPitch['alter'] {
  const index = noteIndex(pitch, tgKey);
  if ((7 + noteIndex(pitch, TG_ONE_FLAT) - index) % 7 === 1) {
    return 1;
  }
  return (7 + noteIndex(pitch, 0) - index) % 7 === 6 ? -1 : 0;
}

/** C4 is B#3 in seven sharps, B3 is Cb4 in six or seven flats. */
function noteOctave(pitch: number, tgKey: number): number {
  const octave = Math.floor(pitch / SEMITONES_PER_OCTAVE) - 1;
  const index = noteIndex(pitch, tgKey);
  if (tgKey === TG_SEVEN_SHARPS && index === B_INDEX && pitch % SEMITONES_PER_OCTAVE === 0) {
    return octave - 1;
  }
  return tgKey >= TG_SIX_FLATS && index === C_INDEX && pitch % SEMITONES_PER_OCTAVE === 11 ? octave + 1 : octave;
}

/** A MIDI pitch (kept within C0…G9) spelled in a key of `keySignature` sharps (negative: flats). */
export function spellPitch(midiPitch: number, keySignature: number): SpelledPitch {
  const pitch = Math.max(MIN_SPELLED_PITCH, Math.min(MAX_SPELLED_PITCH, Math.round(midiPitch)));
  const tgKey = toTgKey(keySignature);
  return { step: STEPS[noteIndex(pitch, tgKey)] ?? 'C', alter: noteAlteration(pitch, tgKey), octave: noteOctave(pitch, tgKey) };
}
