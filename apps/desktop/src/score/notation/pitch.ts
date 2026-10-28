import { type Clef, type Note, type Song, type Track, writtenTransposition } from '@gp-editor/core';

/** The staff a measure is written on. Guitar and bass staves sound an octave below the written notes (trackTransposition). */
export type ClefKind = 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';
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

const OCTAVE = 12;
const LETTERS = 7;
const MAX_KEY = 7;
/** Pitch class of each letter, C … B. */
const LETTER_PITCH_CLASSES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** Letters in the order a key signature adds sharps (F C G D A E B) and flats (B E A D G C F). */
const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [6, 2, 5, 1, 4, 0, 3];
/** Guitar music is written an octave above where it sounds: a track without a channel is written so. */
export const GUITAR_TRANSPOSITION = 12;
const FALLBACK_TUNING = 60;
/** Diatonic step of the bottom line: E4 on the treble staff, G2 on the bass staff, F3 (alto) and D3 (tenor) under a C clef. */
const BOTTOM_LINE_STEP: Readonly<Record<PitchedClef, number>> = {
  treble: 30,
  bass: 18,
  alto: 24,
  tenor: 22,
};

const ACCIDENTAL_OF: Readonly<Record<Alter, Accidental>> = {
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
};

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

function toSpelled(
  natural: number,
  letter: number,
  alter: Alter,
): SpelledPitch {
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
  return toSpelled(
    midi - alter,
    LETTER_PITCH_CLASSES.indexOf(mod(midi - alter, OCTAVE)),
    alter,
  );
}

/** Staff position of a diatonic step: 0 = bottom line, 8 = top line. */
export function staffPosition(step: number, clef: PitchedClef): number {
  return step - BOTTOM_LINE_STEP[clef];
}

/**
 * Semitones a track's notes are written above their sound: an octave for guitars and basses, none for a ukulele, a piano,
 * a voice or any other instrument, by its channel's program and its strings as Guitar Pro writes them (gp-core
 * `writtenTransposition`).
 */
export function trackTransposition(song: Song, trackIndex: number): number {
  const track = song.tracks[trackIndex];
  const channel = song.channels.find((candidate) => candidate.id === track?.channelId);
  if (track === undefined || channel === undefined) {
    return GUITAR_TRANSPOSITION;
  }
  const tuning = track.strings.map((guitarString) => guitarString.tuning);
  return writtenTransposition(channel.program, track.isPercussion || channel.isPercussion, tuning);
}

/** Written MIDI pitch of a note: string tuning + capo + fret, `transposition` above that sound (trackTransposition). */
export function writtenMidi(track: Track, note: Note, transposition: number): number {
  const tuning = track.strings[note.string - 1]?.tuning ?? FALLBACK_TUNING;
  return tuning + track.offset + note.fret + transposition;
}

/** The staff of a clef; neutral clefs and drum tracks use the percussion staff. */
export function clefKind(track: Track, clef: Clef): ClefKind {
  return track.isPercussion || clef === 'neutral' ? 'percussion' : clef;
}

/**
 * Accidentals to draw for a measure's chords in playing order. An accidental holds for its staff position until the
 * bar line; tied notes are never marked and leave the carried accidental alone.
 */
export function measureAccidentals(
  chords: readonly (readonly StaffPitch[])[],
  keySignature: number,
): (Accidental | undefined)[][] {
  let carried: ReadonlyMap<number, Alter> = new Map();
  return chords.map(pitches =>
    pitches.map(pitch => {
      const current =
        carried.get(pitch.step) ??
        keyAlter(mod(pitch.step, LETTERS), keySignature);
      if (pitch.isTied || current === pitch.alter) {
        return undefined;
      }
      carried = new Map(carried).set(pitch.step, pitch.alter);
      return ACCIDENTAL_OF[pitch.alter];
    }),
  );
}
