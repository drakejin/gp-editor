// Port of TuxGuitar GP3OutputStream/GP4OutputStream#writeMeasure / #writeBeat (LGPL-2.1).
import { joinVoices } from '../formats/gtp/normalize';
import type { Beat, Chord, Measure, MeasureHeader, Note } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { durationValueToGp, tupletDivisionToGp, writableDuration } from './gp-units';
import { voiceAt, writableNotes } from './gtp-song';
import type { VoicePlacement } from './gtp-ties';

/** What GP3 and GP4 beats write differently. */
export interface Gp34Dialect {
  readonly version: string;
  readonly hasLyrics: boolean;
  /** Zero bytes Guitar Pro writes after the last measure (GP3: 4, the readers ignore them). */
  readonly trailingZeros: number;
  readonly writeChord: (writer: ByteWriter, chord: Chord) => void;
  /** Whether the beat has beat effects (flag 0x08), given the notes written. */
  readonly hasBeatEffects: (beat: Beat, notes: readonly Note[]) => boolean;
  readonly writeBeatEffects: (writer: ByteWriter, beat: Beat, notes: readonly Note[]) => void;
  readonly writeMixChange: (writer: ByteWriter, tempo: number) => void;
  readonly writeNote: (writer: ByteWriter, note: Note, isTied: boolean) => void;
}

export interface Gp34MeasureContext {
  readonly dialect: Gp34Dialect;
  readonly stringCount: number;
  readonly keptTies: ReadonlySet<Note>;
  /** Tempo of a mix-table change on the measure's first beat. */
  readonly tempoChange?: number;
}

const REST_STATUS = 0x02;
const EMPTY_STATUS = 0x00;

function hasOtherVoices(measure: Measure): boolean {
  return measure.beats.some((beat) => beat.voices.slice(1).some((voice) => !voice.isEmpty));
}

/**
 * The beats a GP3/GP4 file holds: one voice. A measure with more voices has them joined into the first
 * (TuxGuitar's GTPVoiceJoiner); a single-voice measure is written as it is.
 */
export function singleVoiceBeats(measure: Measure, header: MeasureHeader): readonly Beat[] {
  const source = hasOtherVoices(measure) ? joinVoices(measure, header) : measure;
  const beats = [...source.beats].sort((a, b) => a.start - b.start);
  return beats.filter((beat) => !voiceAt(beat, 0).isEmpty);
}

/** GP3/GP4 reading order for the tie replay: the beats, one voice. */
export function placementsGp34(beats: readonly Beat[]): readonly VoicePlacement[] {
  return beats.map((beat) => {
    const voice = voiceAt(beat, 0);
    return { voiceIndex: 0, voice, duration: writableDuration(voice.duration, false) };
  });
}

/**
 * A measure without beats as Guitar Pro writes one: a single empty quarter beat (no measure of a Guitar Pro file has no
 * beat, and readers such as alphaTab fail on one). The GP3/GP4 readers read it back as a quarter rest, as TuxGuitar does.
 */
function writeEmptyMeasureGp34(writer: ByteWriter): void {
  writer.writeInt(1); // beat count
  writer.writeUnsignedByte(0x40).writeUnsignedByte(EMPTY_STATUS); // flags: status follows; the status
  writer.writeByte(durationValueToGp(4)).writeUnsignedByte(0); // a quarter; no string played
}

export function writeMeasureGp34(writer: ByteWriter, beats: readonly Beat[], context: Gp34MeasureContext): void {
  if (beats.length === 0) {
    writeEmptyMeasureGp34(writer);
    return;
  }
  writer.writeInt(beats.length);
  beats.forEach((beat, index) => {
    writeBeatGp34(writer, beat, index === 0 ? context : { ...context, tempoChange: undefined });
  });
}

function writeBeatGp34(writer: ByteWriter, beat: Beat, context: Gp34MeasureContext): void {
  const voice = voiceAt(beat, 0);
  const { dialect } = context;
  const notes = writableNotes(voice, context.stringCount);
  const duration = writableDuration(voice.duration, false);
  const division = tupletDivisionToGp(duration.tuplet, false);
  const flags =
    (duration.dotted ? 0x01 : 0) |
    (beat.chord !== undefined ? 0x02 : 0) |
    (beat.text !== undefined ? 0x04 : 0) |
    (dialect.hasBeatEffects(beat, notes) ? 0x08 : 0) |
    (context.tempoChange !== undefined ? 0x10 : 0) |
    (division !== undefined ? 0x20 : 0) |
    (notes.length === 0 ? 0x40 : 0);
  writer.writeUnsignedByte(flags);
  if ((flags & 0x40) !== 0) {
    writer.writeUnsignedByte(REST_STATUS);
  }
  writer.writeByte(durationValueToGp(duration.value));
  if (division !== undefined) {
    writer.writeInt(division);
  }
  writeBeatExtras(writer, beat, notes, context);
  writer.writeUnsignedByte(notes.reduce((mask, note) => mask | (1 << (7 - note.string)), 0));
  notes.forEach((note) => dialect.writeNote(writer, note, context.keptTies.has(note)));
}

function writeBeatExtras(writer: ByteWriter, beat: Beat, notes: readonly Note[], context: Gp34MeasureContext): void {
  const { dialect } = context;
  if (beat.chord !== undefined) {
    dialect.writeChord(writer, beat.chord);
  }
  if (beat.text !== undefined) {
    writer.writeStringByteSizeOfInteger(beat.text);
  }
  if (dialect.hasBeatEffects(beat, notes)) {
    dialect.writeBeatEffects(writer, beat, notes);
  }
  if (context.tempoChange !== undefined) {
    dialect.writeMixChange(writer, context.tempoChange);
  }
}
