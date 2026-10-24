// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): a beat's duration, notes by string, tied frets, fingering, chords, strokes and mix-table values.
import type { ByteReader } from '../../io/byte-reader';
import { NORMAL_TUPLET, toNoteValue } from '../../model/defaults';
import type { Beat, Chord, Duration, Measure, Note, NoteEffect, Stroke, StrokeDirection } from '../../model/song';
import { fingerFromGp } from '../common/fingering';
import { STROKE_SPEED_CODES, gtpTupletOf, noteValueOfCode } from '../common/gtp-codes';
import { readInts } from './shared';

/** Frets read for tied notes must be below this, else TuxGuitar uses 0. */
const MAX_TIED_FRET = 100;


/** Beat duration: a signed exponent (-2 = whole … 4 = 64th) and, with flag 0x20, a tuplet. */
export function readDuration(reader: ByteReader, flags: number, allowThirteen: boolean): Duration {
  const value = toNoteValue(Math.trunc(2 ** (reader.readByte() + 4) / 4));
  const tuplet = (flags & 0x20) !== 0 ? (gtpTupletOf(reader.readInt(), allowThirteen) ?? NORMAL_TUPLET) : NORMAL_TUPLET;
  return { value, dotted: (flags & 0x01) !== 0, doubleDotted: false, tuplet };
}

/** Beat effects: the note effects every note of the beat starts from, plus the beat's strokes. */
export interface BeatEffects {
  readonly effect: NoteEffect;
  readonly stroke?: Stroke;
  readonly pickStroke?: StrokeDirection;
  /** GP4/GP5's rasgueado flag (no pattern). */
  readonly isRasgueado?: boolean;
}

export interface NoteContext {
  readonly string: number;
  /** The beat's effects, copied into the note. */
  readonly effect: NoteEffect;
  /** Fret of the previous note on this string, for tied notes (-1 if none). */
  readonly tiedFret: () => number;
}

/** Reads the string bitmask (bit 6 = string 1) and one note per set bit the track has a string for. */
export function readStringNotes(
  reader: ByteReader,
  stringCount: number,
  readNote: (string: number) => Note,
): readonly Note[] {
  const stringFlags = reader.readUnsignedByte();
  const notes: Note[] = [];
  for (let i = 6; i >= 0; i--) {
    if ((stringFlags & (1 << i)) !== 0 && 6 - i < stringCount) {
      notes.push(readNote(7 - i));
    }
  }
  return notes;
}

/** Fret of the latest earlier note on `string`, searched like TuxGuitar's getTiedNoteValue; -1 if none. */
export function findTiedFret(previous: readonly Measure[], current: readonly Beat[], string: number): number {
  const found = searchTiedFret(current, string);
  if (found !== undefined) {
    return found;
  }
  for (let m = previous.length - 1; m >= 0; m--) {
    const fret = searchTiedFret(previous[m]?.beats ?? [], string);
    if (fret !== undefined) {
      return fret;
    }
  }
  return -1;
}

function searchTiedFret(beats: readonly Beat[], string: number): number | undefined {
  for (let b = beats.length - 1; b >= 0; b--) {
    for (const voice of beats[b]?.voices ?? []) {
      const note = voice.isEmpty ? undefined : voice.notes.find((candidate) => candidate.string === string);
      if (note !== undefined) {
        return note.fret;
      }
    }
  }
  return undefined;
}

/** A note's fingering (note flag 0x80): the left-hand finger, then the right-hand one, each 0 thumb … 4 little, -1 none. */
export function readFingers(reader: ByteReader): Pick<Note, 'leftFinger' | 'rightFinger'> {
  const leftFinger = fingerFromGp(reader.readByte());
  const rightFinger = fingerFromGp(reader.readByte());
  return { ...(leftFinger === undefined ? {} : { leftFinger }), ...(rightFinger === undefined ? {} : { rightFinger }) };
}

/** Note fret: tied notes repeat the previous fret; anything outside 0…99 becomes 0. */
export function resolveFret(raw: number, isTied: boolean, tiedFret: () => number): number {
  const value = isTied ? tiedFret() : raw;
  return value >= 0 && value < MAX_TIED_FRET ? value : 0;
}

/**
 * A chord with a fret per track string (-1 = not played). TuxGuitar drops chords without any played
 * string; we also keep chords that only have a name (GP3/GP4 "simple" chords without a diagram).
 */
export function buildChord(name: string, firstFret: number, frets: readonly number[], stringCount: number): Chord | undefined {
  const strings = Array.from({ length: Math.max(0, stringCount) }, (_, index) => frets[index] ?? -1);
  const isUsed = name.length > 0 || strings.some((fret) => fret >= 0);
  return isUsed ? { name, firstFret, frets: strings } : undefined;
}

/** GP3/GP4 chord without diagram details: name, first fret and (if the first fret is set) six frets. */
export function readSimpleChord(reader: ByteReader, stringCount: number): Chord | undefined {
  const name = reader.readStringByteSizeOfInteger();
  const firstFret = reader.readInt();
  const frets = firstFret !== 0 ? readInts(reader, 6) : [];
  return buildChord(name, firstFret, frets, stringCount);
}

/** Stroke speed byte to a note value (TuxGuitar's toStrokeValue). */
function strokeValue(value: number): number {
  return noteValueOfCode(STROKE_SPEED_CODES, value) ?? 64;
}

/** Two stroke bytes; GP3/GP4 store "down" first, GP5 "up" first. The first one set wins. */
export function readStroke(reader: ByteReader, first: 'up' | 'down'): Stroke | undefined {
  const firstValue = reader.readByte();
  const secondValue = reader.readByte();
  if (firstValue > 0) {
    return { direction: first, value: strokeValue(firstValue) };
  }
  if (secondValue > 0) {
    return { direction: first === 'down' ? 'up' : 'down', value: strokeValue(secondValue) };
  }
  return undefined;
}

export function readPickStroke(reader: ByteReader): StrokeDirection | undefined {
  const direction = reader.readByte();
  if ((direction & 0x01) !== 0) {
    return 'up';
  }
  return (direction & 0x02) !== 0 ? 'down' : undefined;
}

/** Volume, pan, chorus, reverb, phaser and tremolo. */
const MIX_TABLE_VALUE_COUNT = 6;

/** GP3–GP5 mix-table values, one signed byte each (negative = unchanged). */
export function readMixTableValues(reader: ByteReader): readonly number[] {
  return Array.from({ length: MIX_TABLE_VALUE_COUNT }, () => reader.readByte());
}

/** Skips the transition-duration byte that follows the tempo for each changed (≥ 0) mix-table value. */
export function skipMixTransitions(reader: ByteReader, values: readonly number[]): void {
  values.forEach((value) => {
    if (value >= 0) {
      reader.readByte();
    }
  });
}
