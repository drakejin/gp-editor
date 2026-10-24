// Port of TuxGuitar app.tuxguitar.io.gtp.GP5OutputStream#writeMeasure / #writeBeat (LGPL-2.1).
import { GP5_BREAK_SECONDARY_BEAMS, GP5_SECONDARY_BEAMS_KEPT, gp5BeamFlags } from '../formats/gtp/gp5-beams';
import { durationTicks, plainDuration } from '../model/defaults';
import type { Beat, Chord, Duration, Measure, Note, Voice } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { durationValueToGp, tupletDivisionToGp, writableDuration } from './gp-units';
import { hasBeatEffects, type VoiceEffects, voiceEffects, writeBeatEffectsGp45 } from './gp45-beat-effects';
import { writeNoteGp45 } from './gp45-notes';
import { voiceSequence } from './gp5-voices';
import { isBeatCarrier, MAX_GP_VOICES, voiceAt, writableNotes } from './gtp-song';

/** What writing one track's measure needs besides the measure. */
export interface MeasureContext {
  readonly stringCount: number;
  /** Tied notes written as tied (the others would read back with another fret: see resolveKeptTies). */
  readonly keptTies: ReadonlySet<Note>;
  /** Tempo of a mix-table change on the measure's first beat (first track only). */
  readonly tempoChange?: number;
}

/** One beat: its measure's context, the tempo change it carries, its display flags. */
interface BeatContext extends MeasureContext {
  readonly displayFlags: number;
}

const QUARTER_DURATION_BYTE = 0;
const REST_STATUS = 0x02;
const EMPTY_STATUS = 0x00;
/** Display flags (high byte of the beat's last short): first and last beat of a tuplet bracket. */
const TUPLET_BRACKET_START = 0x0200;
const TUPLET_BRACKET_END = 0x0400;

/** Two voices; a voice without beats gets one empty quarter beat, as Guitar Pro writes it. */
export function writeMeasureGp5(writer: ByteWriter, measure: Measure, context: MeasureContext): void {
  for (let voiceIndex = 0; voiceIndex < MAX_GP_VOICES; voiceIndex++) {
    const beats = voiceSequence(measure, voiceIndex);
    const tempo = voiceIndex === 0 ? context.tempoChange : undefined;
    if (beats.length === 0) {
      writer.writeInt(1);
      writeEmptyBeat(writer, tempo);
      continue;
    }
    const brackets = tupletBrackets(beats.map((beat) => writtenDuration(voiceAt(beat, voiceIndex))));
    writer.writeInt(beats.length);
    beats.forEach((beat, index) => {
      const displayFlags = (brackets[index] ?? 0) | beamFlagsFrom(beats[index - 1], beat, voiceIndex);
      writeBeatGp5(writer, beat, voiceIndex, { ...context, tempoChange: index === 0 ? tempo : undefined, displayFlags });
    });
  }
}

/** GP5 keeps the beam from the voice's previous beat on the later beat (an empty beat takes none). */
function beamFlagsFrom(previous: Beat | undefined, beat: Beat, voiceIndex: number): number {
  return previous === undefined || voiceAt(beat, voiceIndex).isEmpty ? 0 : gp5BeamFlags(voiceAt(previous, voiceIndex).beamToNext);
}

/** The duration written for a voice; undefined for an empty voice (it takes no time). */
function writtenDuration(voice: Voice): Duration | undefined {
  return voice.isEmpty ? undefined : writableDuration(voice.duration, true);
}

function isSameTuplet(a: Duration, b: Duration): boolean {
  return a.tuplet.enters === b.tuplet.enters && a.tuplet.times === b.tuplet.times;
}

/**
 * Guitar Pro draws a bracket over each tuplet group, from the beat flagged "start" to the one flagged
 * "end": a group runs until its beats fill `times` notes of the first beat's value (3 eighths of a triplet
 * fill 2 eighths), or the tuplet changes.
 */
function tupletBrackets(durations: readonly (Duration | undefined)[]): readonly number[] {
  const flags = durations.map(() => 0);
  let group: { readonly first: Duration; readonly target: number; filled: number } | undefined;
  const close = (index: number): void => {
    flags[index] = (flags[index] ?? 0) | (group === undefined ? 0 : TUPLET_BRACKET_END);
    group = undefined;
  };
  durations.forEach((duration, index) => {
    if (group !== undefined && (duration === undefined || !isSameTuplet(group.first, duration))) {
      close(index - 1);
    }
    if (duration === undefined || duration.tuplet.enters === 1) {
      return;
    }
    if (group === undefined) {
      const target = duration.tuplet.times * durationTicks(plainDuration(duration.value));
      group = { first: duration, target, filled: 0 };
      flags[index] = TUPLET_BRACKET_START;
    }
    group.filled += durationTicks(duration);
    if (group.filled >= group.target) {
      close(index);
    }
  });
  if (group !== undefined) {
    close(durations.length - 1);
  }
  return flags;
}

function writeEmptyBeat(writer: ByteWriter, tempo: number | undefined): void {
  writer.writeUnsignedByte(0x40 | (tempo === undefined ? 0 : 0x10));
  writer.writeUnsignedByte(EMPTY_STATUS).writeByte(QUARTER_DURATION_BYTE);
  if (tempo !== undefined) {
    writeMixChangeGp5(writer, tempo);
  }
  writer.writeUnsignedByte(0).writeShort(0);
}

interface BeatParts {
  readonly voice: Voice;
  readonly duration: Duration;
  readonly notes: readonly Note[];
  readonly effects: VoiceEffects;
  readonly division: number | undefined;
  readonly isCarrier: boolean;
}

function beatFlags(beat: Beat, parts: BeatParts, tempo: number | undefined): number {
  const { duration } = parts;
  const { isEmpty } = parts.voice;
  return (
    (duration.dotted || duration.doubleDotted ? 0x01 : 0) |
    (parts.isCarrier && beat.chord !== undefined ? 0x02 : 0) |
    (parts.isCarrier && beat.text !== undefined ? 0x04 : 0) |
    (!isEmpty && hasBeatEffects(beat, parts.effects) ? 0x08 : 0) |
    (tempo !== undefined ? 0x10 : 0) |
    (parts.division !== undefined ? 0x20 : 0) |
    (parts.notes.length === 0 ? 0x40 : 0)
  );
}

function writeBeatGp5(writer: ByteWriter, beat: Beat, voiceIndex: number, context: BeatContext): void {
  const voice = voiceAt(beat, voiceIndex);
  const notes = voice.isEmpty ? [] : writableNotes(voice, context.stringCount);
  const duration = writableDuration(voice.duration, true);
  const parts: BeatParts = {
    voice,
    duration,
    notes,
    effects: voiceEffects(notes),
    division: tupletDivisionToGp(duration.tuplet, true),
    isCarrier: isBeatCarrier(beat, voiceIndex),
  };
  const flags = beatFlags(beat, parts, context.tempoChange);
  writer.writeUnsignedByte(flags);
  if ((flags & 0x40) !== 0) {
    writer.writeUnsignedByte(voice.isEmpty ? EMPTY_STATUS : REST_STATUS);
  }
  writer.writeByte(durationValueToGp(duration.value));
  if (parts.division !== undefined) {
    writer.writeInt(parts.division);
  }
  writeBeatExtras(writer, beat, parts, flags);
  if (context.tempoChange !== undefined) {
    writeMixChangeGp5(writer, context.tempoChange);
  }
  writeStringNotes(writer, notes, context.keptTies);
  writer.writeShort(context.displayFlags); // beam and display flags
  if ((context.displayFlags & GP5_BREAK_SECONDARY_BEAMS) !== 0) {
    writer.writeByte(GP5_SECONDARY_BEAMS_KEPT);
  }
}

function writeBeatExtras(writer: ByteWriter, beat: Beat, parts: BeatParts, flags: number): void {
  if (beat.chord !== undefined && (flags & 0x02) !== 0) {
    writeChordGp5(writer, beat.chord);
  }
  if (beat.text !== undefined && (flags & 0x04) !== 0) {
    writer.writeStringByteSizeOfInteger(beat.text);
  }
  if ((flags & 0x08) !== 0) {
    writeBeatEffectsGp45(writer, beat, parts.effects, 'up');
  }
}

/** String bitmask (bit 6 = string 1), then the notes from string 1 down. */
function writeStringNotes(writer: ByteWriter, notes: readonly Note[], keptTies: ReadonlySet<Note>): void {
  writer.writeUnsignedByte(notes.reduce((mask, note) => mask | (1 << (7 - note.string)), 0));
  for (const note of notes) {
    writeNoteGp45(writer, note, keptTies.has(note), 'gp5');
  }
}

/** TuxGuitar's chord header: new-format diagram, sharp, root C, no type, no bass. */
const CHORD_HEADER = [1, 1, 0, 0, 0, 12, 0, 0, -1, -1, -1, -1, 0, 0, 0, 0, 0] as const;
const CHORD_NAME_SIZE = 21;
const CHORD_FRETS = 7;

function writeChordGp5(writer: ByteWriter, chord: Chord): void {
  writer.writeBytes(CHORD_HEADER).writeStringByte(chord.name, CHORD_NAME_SIZE).skipBytes(4);
  writer.writeInt(chord.firstFret);
  for (let i = 0; i < CHORD_FRETS; i++) {
    writer.writeInt(chord.frets[i] ?? -1);
  }
  writer.skipBytes(32); // barres, omissions, fingering, "show diagram"
}

/**
 * GP5 (v5.10) mix-table change holding only a tempo: no instrument (-1), no RSE instrument, no mixer
 * changes, an empty tempo name, the tempo with no transition and not hidden, no wah, no RSE effect.
 */
function writeMixChangeGp5(writer: ByteWriter, tempo: number): void {
  writer.writeByte(-1).writeBytes(new Array<number>(16).fill(0xff));
  writer.writeBytes(new Array<number>(6).fill(0xff));
  writer.writeStringByteSizeOfInteger('').writeInt(tempo);
  writer.writeByte(0).writeByte(0); // tempo transition, hide tempo
  writer.writeByte(0).writeByte(-1); // "apply to all tracks" flags, wah
  writer.writeStringByteSizeOfInteger('').writeStringByteSizeOfInteger('');
}
