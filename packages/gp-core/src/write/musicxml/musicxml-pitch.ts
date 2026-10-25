// Port of TuxGuitar app.tuxguitar.util.TGMusicKeyUtils (noteShortName, noteAlteration, noteOctave; LGPL-2.1): how a MIDI pitch is spelled in a key.
import { NOTE_LETTERS } from '../../edit/key-spelling';
import { type Alteration, alterationInKey, letterIndexInKey, toTuxSignature } from '../../scales/spelling';

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

const B_INDEX = 6;
const C_INDEX = 0;
const TUX_SEVEN_SHARPS = 7;
const TUX_SIX_FLATS = 13;

const ALTER: Readonly<Record<Alteration, SpelledPitch['alter']>> = { natural: 0, sharp: 1, flat: -1 };

/** C4 is B#3 in seven sharps, B3 is Cb4 in six or seven flats. */
function noteOctave(pitch: number, signature: number, letterIndex: number): number {
  const octave = Math.floor(pitch / SEMITONES_PER_OCTAVE) - 1;
  const pitchClass = pitch % SEMITONES_PER_OCTAVE;
  if (signature === TUX_SEVEN_SHARPS && letterIndex === B_INDEX && pitchClass === 0) {
    return octave - 1;
  }
  return signature >= TUX_SIX_FLATS && letterIndex === C_INDEX && pitchClass === 11 ? octave + 1 : octave;
}

/** A MIDI pitch (kept within C0…G9) spelled in a key of `keySignature` sharps (negative: flats). */
export function spellPitch(midiPitch: number, keySignature: number): SpelledPitch {
  const pitch = Math.max(MIN_SPELLED_PITCH, Math.min(MAX_SPELLED_PITCH, Math.round(midiPitch)));
  const signature = toTuxSignature(keySignature);
  const pitchClass = pitch % SEMITONES_PER_OCTAVE;
  const letterIndex = letterIndexInKey(pitchClass, signature);
  return { step: NOTE_LETTERS[letterIndex] ?? 'C', alter: ALTER[alterationInKey(pitchClass, signature)], octave: noteOctave(pitch, signature, letterIndex) };
}
