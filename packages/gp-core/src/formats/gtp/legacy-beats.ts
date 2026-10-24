// Port of TuxGuitar app.tuxguitar.io.gtp.GP1InputStream / GP2InputStream, shared parts (LGPL-2.1): a beat — duration, notes, effects and chord.
import { GpFormatError } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';
import { EMPTY_NOTE_EFFECT, NORMAL_TUPLET, isNoteValue } from '../../model/defaults';
import type { Bend, Chord, Duration, Harmonic, Note, NoteEffect, Tuplet } from '../../model/song';
import { BEND_MAX_POSITION } from '../common/bend-units';
import { artificialHarmonicOffset } from '../common/harmonics';
import type { LegacyDialect } from './legacy-shared';

const BEAT_TEXT = 0x01;
const BEAT_CHORD = 0x02;
const BEAT_EFFECTS = 0x04;
const BEAT_REST = 0x08;
const BEAT_DOTTED = 0x10;
const BEAT_TRIPLET = 0x20;
const BEAT_TIED = 0x40;
const DEAD_NOTE_FRET = 100;
const CHORD_DIAGRAM_KIND = 12;
const CHORD_DIAGRAM_PADDING = 32;
const CHORD_FRETS = 6;
const TRIPLET: Tuplet = { enters: 3, times: 2 };
const SHIFT_SLIDE = ['shift'] as const;
/** TGEffectBend.SEMITONE_LENGTH. */
const BEND_SEMITONE_LENGTH = 1;
const NATURAL_HARMONIC: Harmonic = { type: 'natural', data: 0 };
/** TuxGuitar stores harmonic data 0, an index into NATURAL_FREQUENCIES. */
const ARTIFICIAL_HARMONIC: Harmonic = { type: 'artificial', data: artificialHarmonicOffset(0) };

/** A beat as read, before TuxGuitar's updatePreciseStart / autoCompleteSilences. */
export interface ReadBeat {
  readonly start: number;
  readonly duration: Duration;
  readonly notes: readonly Note[];
  readonly chord?: Chord;
  readonly text?: string;
}

export function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

interface LegacyBeatRead {
  readonly beat: ReadBeat;
  readonly tempo?: number;
}

export function readBeat(
  reader: ByteReader,
  dialect: LegacyDialect,
  stringCount: number,
  start: number,
  findTiedSource: () => ReadBeat | undefined,
): LegacyBeatRead {
  reader.readInt();
  const value = readDurationValue(reader);
  const flags = reader.readUnsignedByte();
  const tempo = dialect.readBeatPrefix(reader);
  const isTriplet = (flags & BEAT_TRIPLET) !== 0;
  if (isTriplet) {
    reader.skip(1);
  }
  const duration: Duration = {
    value,
    dotted: (flags & BEAT_DOTTED) !== 0,
    doubleDotted: false,
    tuplet: isTriplet ? TRIPLET : NORMAL_TUPLET,
  };
  const effect = (flags & BEAT_EFFECTS) !== 0 ? readBeatEffects(reader) : EMPTY_NOTE_EFFECT;
  const chord = (flags & BEAT_CHORD) !== 0 ? readChord(reader, dialect, stringCount) : undefined;
  const text = (flags & BEAT_TEXT) !== 0 ? reader.readStringByte(0) : undefined;
  const notes = readBeatNotes(reader, dialect, { flags, stringCount, effect, findTiedSource });
  const beat: ReadBeat = { start, duration, notes, ...(chord ? { chord } : {}), ...(text !== undefined ? { text } : {}) };
  return tempo === undefined ? { beat } : { beat, tempo };
}

/** 2^(byte + 4) / 4: -2 = whole … 4 = sixty-fourth. */
function readDurationValue(reader: ByteReader): Duration['value'] {
  const position = reader.position;
  const value = Math.trunc(2 ** (reader.readByte() + 4) / 4);
  if (!isNoteValue(value)) {
    throw new GpFormatError(`Unsupported duration value ${value} at byte ${position}`);
  }
  return value;
}

interface NotesContext {
  readonly flags: number;
  readonly stringCount: number;
  readonly effect: NoteEffect;
  /** The beat read just before this one (getBeat(track, measure, lastReadedStart)). */
  readonly findTiedSource: () => ReadBeat | undefined;
}

function readBeatNotes(reader: ByteReader, dialect: LegacyDialect, context: NotesContext): readonly Note[] {
  if ((context.flags & BEAT_TIED) !== 0) {
    return (context.findTiedSource()?.notes ?? []).map((note) => ({
      fret: note.fret,
      velocity: note.velocity,
      string: note.string,
      isTied: true,
      effect: EMPTY_NOTE_EFFECT,
    }));
  }
  if ((context.flags & BEAT_REST) !== 0) {
    return [];
  }
  const stringFlags = reader.readUnsignedByte();
  const effectFlags = reader.readUnsignedByte();
  const graceFlags = dialect.hasGraceFlags ? reader.readUnsignedByte() : 0;
  const notes: Note[] = [];
  for (let bit = 5; bit >= 0; bit--) {
    const mask = 1 << bit;
    if ((stringFlags & mask) !== 0) {
      const note = readNote(reader, dialect, context, (effectFlags & mask) !== 0);
      notes.push({ ...note, string: context.stringCount - bit });
    }
    if ((graceFlags & mask) !== 0) {
      reader.skip(3); // grace note: read and dropped by TuxGuitar
    }
  }
  return notes.filter((note) => note.string >= 1);
}

function readNote(
  reader: ByteReader,
  dialect: LegacyDialect,
  context: NotesContext,
  hasEffects: boolean,
): Omit<Note, 'string'> {
  const fret = reader.readUnsignedByte();
  const velocity = dialect.readVelocity(reader);
  const effect = hasEffects ? readNoteEffects(reader, context.effect) : context.effect;
  const isDead = fret >= DEAD_NOTE_FRET;
  return { fret: isDead ? 0 : fret, velocity, isTied: false, effect: { ...effect, deadNote: isDead } };
}

/**
 * Beat effects apply to every note of the beat. Flags are kept as the file sets them,
 * without TGNoteEffect's clearing of "incompatible" effects. Code 2 is wide vibrato (as GP3's
 * flag 0x02), which TuxGuitar reads as vibrato.
 */
function readBeatEffects(reader: ByteReader): NoteEffect {
  const code = reader.readUnsignedByte();
  const effect: NoteEffect = {
    ...EMPTY_NOTE_EFFECT,
    vibrato: code === 1,
    wideVibrato: code === 2,
    fadeIn: code === 4,
    tapping: code === 5,
    slapping: code === 6,
    popping: code === 7,
  };
  if (code === 3) {
    return { ...effect, bend: readBend(reader) };
  }
  if (code === 8 || code === 9) {
    return { ...effect, harmonic: code === 8 ? NATURAL_HARMONIC : ARTIFICIAL_HARMONIC };
  }
  return effect;
}

/**
 * A note's own effect, on top of the beat effects. TuxGuitar mutates one effect object
 * per beat, so a note effect leaks into the following notes of that beat; here it does not.
 */
function readNoteEffects(reader: ByteReader, beatEffect: NoteEffect): NoteEffect {
  const code = reader.readUnsignedByte();
  const effect: NoteEffect = {
    ...beatEffect,
    hammer: code === 1 || code === 2,
    slides: code === 3 || code === 4 ? SHIFT_SLIDE : [],
  };
  return code === 5 || code === 6 ? { ...effect, bend: readBend(reader) } : effect;
}

function readBend(reader: ByteReader): Bend {
  reader.skip(6);
  const value = Math.round(Math.max(reader.readUnsignedByte() / 8 - 26, 1) * BEND_SEMITONE_LENGTH);
  reader.skip(1);
  return {
    points: [
      { position: 0, value: 0 },
      { position: Math.round(BEND_MAX_POSITION / 2), value },
      { position: BEND_MAX_POSITION, value },
    ],
  };
}

function readChord(reader: ByteReader, dialect: LegacyDialect, stringCount: number): Chord | undefined {
  if (!dialect.hasFullChords) {
    reader.readStringByteSizeOfByte(); // chord name only: skipped by TuxGuitar
    return undefined;
  }
  const name = reader.readStringByte(0);
  reader.skip(1);
  if (reader.readInt() < CHORD_DIAGRAM_KIND) {
    reader.skip(CHORD_DIAGRAM_PADDING);
  }
  const firstFret = reader.readInt();
  const written = firstFret !== 0 ? range(CHORD_FRETS).map(() => reader.readInt()) : [];
  const frets = range(stringCount).map((i) => written[i] ?? -1);
  return frets.some((fret) => fret >= 0) ? { name, firstFret, frets } : undefined;
}
