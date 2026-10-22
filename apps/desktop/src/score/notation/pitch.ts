import type { Clef, Note, Track } from '@gp-editor/core';
import { STAFF } from './metrics';

/** The staff a measure is written on. Guitar and bass staves sound an octave below the written notes. */
export type ClefKind = 'treble' | 'bass' | 'percussion';
export type PitchedClef = Exclude<ClefKind, 'percussion'>;

export type Alter = -1 | 0 | 1;
export type Accidental = 'flat' | 'natural' | 'sharp';

export interface SpelledPitch {
  /** Diatonic step: octave * 7 + letter (C = 0 … B = 6). Middle C (MIDI 60) is 28. */
  readonly step: number;
  readonly alter: Alter;
}

export interface StaffPitch extends SpelledPitch {
  readonly isTied: boolean;
}

export interface DrumPlacement {
  readonly position: number;
  readonly isCross: boolean;
}

const OCTAVE = 12;
const LETTERS = 7;
const MAX_KEY = 7;
/** Pitch class of each letter, C … B. */
const LETTER_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** Letters in the order a key signature adds sharps (F C G D A E B) and flats (B E A D G C F). */
const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [6, 2, 5, 1, 4, 0, 3];
/** Guitar and bass music is written an octave above where it sounds. */
const WRITTEN_OCTAVE = 12;
const FALLBACK_TUNING = 60;
/** Diatonic step of the bottom line: E4 on the treble staff, G2 on the bass staff. */
const BOTTOM_LINE_STEP: Readonly<Record<PitchedClef, number>> = { treble: 30, bass: 18 };

const ACCIDENTAL_OF: Readonly<Record<Alter, Accidental>> = { [-1]: 'flat', 0: 'natural', 1: 'sharp' };

const CROSS = true;
/** General MIDI drums on a five-line percussion staff (positions as on a treble staff). */
const DRUM_PLACEMENTS: ReadonlyMap<number, DrumPlacement> = new Map(
  (
    [
      [35, 0, !CROSS], // acoustic bass drum
      [36, 1, !CROSS], // bass drum
      [37, 5, CROSS], // side stick
      [38, 5, !CROSS], // snare
      [39, 5, CROSS], // hand clap
      [40, 5, !CROSS], // electric snare
      [41, 2, !CROSS], // low floor tom
      [42, 9, CROSS], // closed hi-hat
      [43, 3, !CROSS], // high floor tom
      [44, -1, CROSS], // pedal hi-hat
      [45, 4, !CROSS], // low tom
      [46, 9, CROSS], // open hi-hat
      [47, 6, !CROSS], // low-mid tom
      [48, 6, !CROSS], // hi-mid tom
      [49, 10, CROSS], // crash 1
      [50, 7, !CROSS], // high tom
      [51, 8, CROSS], // ride
      [52, 10, CROSS], // china
      [53, 8, CROSS], // ride bell
      [55, 10, CROSS], // splash
      [57, 10, CROSS], // crash 2
      [59, 8, CROSS], // ride 2
    ] as const
  ).map(([drum, position, isCross]) => [drum, { position, isCross }]),
);
const UNKNOWN_DRUM: DrumPlacement = { position: STAFF.middleLine, isCross: false };

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clampKey(keySignature: number): number {
  return Math.max(-MAX_KEY, Math.min(MAX_KEY, Math.trunc(keySignature)));
}

/** The alteration a key signature gives a letter (0 = C … 6 = B). */
export function keyAlter(letter: number, keySignature: number): Alter {
  const key = clampKey(keySignature);
  if (key > 0) {
    return SHARP_ORDER.indexOf(letter) < key ? 1 : 0;
  }
  if (key < 0) {
    return FLAT_ORDER.indexOf(letter) < -key ? -1 : 0;
  }
  return 0;
}

function toSpelled(natural: number, letter: number, alter: Alter): SpelledPitch {
  return { step: (Math.floor(natural / OCTAVE) - 1) * LETTERS + letter, alter };
}

/**
 * Letter name and alteration of a MIDI pitch: the key's own spelling for notes of the key (E# in F# major),
 * otherwise naturals for white keys, and sharps in sharp keys and C, flats in flat keys.
 */
export function spellPitch(midi: number, keySignature: number): SpelledPitch {
  for (let letter = 0; letter < LETTERS; letter++) {
    const alter = keyAlter(letter, keySignature);
    if (mod(midi - alter, OCTAVE) === LETTER_PITCH_CLASSES[letter]) {
      return toSpelled(midi - alter, letter, alter);
    }
  }
  const whiteLetter = LETTER_PITCH_CLASSES.indexOf(mod(midi, OCTAVE));
  if (whiteLetter >= 0) {
    return toSpelled(midi, whiteLetter, 0);
  }
  const alter: Alter = clampKey(keySignature) < 0 ? -1 : 1;
  return toSpelled(midi - alter, LETTER_PITCH_CLASSES.indexOf(mod(midi - alter, OCTAVE)), alter);
}

/** Staff position of a diatonic step: 0 = bottom line, 8 = top line. */
export function staffPosition(step: number, clef: PitchedClef): number {
  return step - BOTTOM_LINE_STEP[clef];
}

/** Written MIDI pitch of a note: string tuning + capo + fret, an octave up. */
export function writtenMidi(track: Track, note: Note): number {
  const tuning = track.strings[note.string - 1]?.tuning ?? FALLBACK_TUNING;
  return tuning + track.offset + note.fret + WRITTEN_OCTAVE;
}

/** Tenor and alto clefs are written on the treble staff; neutral clefs and drum tracks use the percussion staff. */
export function clefKind(track: Track, clef: Clef): ClefKind {
  if (track.isPercussion || clef === 'neutral') {
    return 'percussion';
  }
  return clef === 'bass' ? 'bass' : 'treble';
}

/** Staff position and notehead of a General MIDI drum note; unknown drums sit on the middle line. */
export function drumPlacement(drumNote: number): DrumPlacement {
  return DRUM_PLACEMENTS.get(drumNote) ?? UNKNOWN_DRUM;
}

/**
 * Accidentals to draw for a measure's chords in playing order. An accidental holds for its staff position until the
 * bar line; tied notes are never marked and leave the carried accidental alone.
 */
export function measureAccidentals(chords: readonly (readonly StaffPitch[])[], keySignature: number): (Accidental | undefined)[][] {
  let carried: ReadonlyMap<number, Alter> = new Map();
  return chords.map((pitches) =>
    pitches.map((pitch) => {
      const current = carried.get(pitch.step) ?? keyAlter(mod(pitch.step, LETTERS), keySignature);
      if (pitch.isTied || current === pitch.alter) {
        return undefined;
      }
      carried = new Map(carried).set(pitch.step, pitch.alter);
      return ACCIDENTAL_OF[pitch.alter];
    }),
  );
}
