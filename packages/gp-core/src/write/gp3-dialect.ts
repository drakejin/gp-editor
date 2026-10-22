// Port of TuxGuitar app.tuxguitar.io.gtp.GP3OutputStream#writeBeatEffects / #writeNote / #writeMixChange (LGPL-2.1): what GP3 beats write.
import type { Beat, Bend, Chord, Harmonic, Note, NoteEffect } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { writeBendCurve } from './gp-bends';
import { bendValueToGp } from './gp-units';
import type { Gp34Dialect } from './gp34-beats';
import { strokeBytes } from './gp45-beat-effects';
import { hasOwnDynamic, noteType, writeDynamicAndFret, writeGraceGp34 } from './gtp-notes';

const CHORD_HEADER_SIZE = 25;
/**
 * The name holds 22 bytes, then come three alteration ints (fifth, ninth, eleventh). The reader takes
 * all 34 bytes as the name, but Guitar Pro 3 would read longer names as alterations: they are cut to 22.
 */
const CHORD_NAME_SIZE = 22;
const CHORD_ALTERATIONS_SIZE = 12;
const CHORD_FRETS = 6;
const CHORD_TAIL_SIZE = 36;
const MIX_TABLE_UNCHANGED = [-1, -1, -1, -1, -1, -1, -1] as const;
/** GP3 special effect types (beat effect 0x20). */
const SPECIAL_EFFECT = { tremoloBar: 0, tapping: 1, slapping: 2, popping: 3 } as const;

/** GP3 chord diagram (first byte 1): header, name, first fret, six frets, barres and omissions. */
function writeChordGp3(writer: ByteWriter, chord: Chord): void {
  writer.writeUnsignedByte(0x01).skipBytes(CHORD_HEADER_SIZE);
  writer.writeStringByte(chord.name, CHORD_NAME_SIZE).skipBytes(CHORD_ALTERATIONS_SIZE);
  writer.writeInt(chord.firstFret);
  for (let i = 0; i < CHORD_FRETS; i++) {
    writer.writeInt(chord.frets[i] ?? -1);
  }
  writer.skipBytes(CHORD_TAIL_SIZE);
}

/** GP3 keeps vibrato, harmonics, fade in and the special effects per beat: what any note has counts. */
interface Gp3BeatEffects {
  readonly vibrato: boolean;
  readonly harmonic?: Harmonic;
  readonly fadeIn: boolean;
  readonly tremoloBar?: Bend;
  readonly slapType: number;
}

function gp3BeatEffects(notes: readonly Note[]): Gp3BeatEffects {
  const someNote = (test: (effect: NoteEffect) => boolean): boolean => notes.some((note) => test(note.effect));
  const harmonic = notes.find((note) => note.effect.harmonic !== undefined)?.effect.harmonic;
  const tremoloBar = notes.find((note) => note.effect.tremoloBar !== undefined)?.effect.tremoloBar;
  const slapType = someNote((e) => e.tapping)
    ? SPECIAL_EFFECT.tapping
    : someNote((e) => e.slapping)
      ? SPECIAL_EFFECT.slapping
      : someNote((e) => e.popping)
        ? SPECIAL_EFFECT.popping
        : 0;
  return {
    vibrato: someNote((e) => e.vibrato),
    fadeIn: someNote((e) => e.fadeIn),
    slapType,
    ...(harmonic === undefined ? {} : { harmonic }),
    ...(tremoloBar === undefined ? {} : { tremoloBar }),
  };
}

function beatEffectFlags(beat: Beat, effects: Gp3BeatEffects): number {
  return (
    (effects.vibrato ? 0x01 : 0) |
    (effects.harmonic?.type === 'natural' ? 0x04 : 0) |
    (effects.harmonic !== undefined && effects.harmonic.type !== 'natural' ? 0x08 : 0) |
    (effects.fadeIn ? 0x10 : 0) |
    (effects.tremoloBar !== undefined || effects.slapType !== 0 ? 0x20 : 0) |
    (beat.stroke.direction !== 'none' ? 0x40 : 0)
  );
}

/** The deepest point of a tremolo bar: GP3 stores one dive (its reader rebuilds 0 → dive → 0). */
function diveOf(tremoloBar: Bend): number {
  return tremoloBar.points.reduce((deepest, point) => (Math.abs(point.value) > Math.abs(deepest) ? point.value : deepest), 0);
}

function writeBeatEffectsGp3(writer: ByteWriter, beat: Beat, notes: readonly Note[]): void {
  const effects = gp3BeatEffects(notes);
  const flags = beatEffectFlags(beat, effects);
  writer.writeUnsignedByte(flags);
  if (effects.tremoloBar !== undefined) {
    writer.writeUnsignedByte(SPECIAL_EFFECT.tremoloBar).writeInt(-bendValueToGp(diveOf(effects.tremoloBar)));
  } else if (effects.slapType !== 0) {
    writer.writeUnsignedByte(effects.slapType).writeInt(0);
  }
  if ((flags & 0x40) !== 0) {
    writer.writeBytes(strokeBytes(beat.stroke.direction, beat.stroke.value, 'down'));
  }
}

function noteEffectFlags(effect: NoteEffect): number {
  return (
    ((effect.bend?.points.length ?? 0) > 0 ? 0x01 : 0) |
    (effect.hammer ? 0x02 : 0) |
    (effect.slides.length > 0 ? 0x04 : 0) |
    (effect.letRing ? 0x08 : 0) |
    (effect.grace !== undefined ? 0x10 : 0)
  );
}

/** GP3 note: flags (ghost, effects, dynamic, type and fret), then bend and grace effects. */
function writeNoteGp3(writer: ByteWriter, note: Note, isTied: boolean): void {
  const effectFlags = noteEffectFlags(note.effect);
  const flags = 0x20 | (hasOwnDynamic(note) ? 0x10 : 0) | (effectFlags !== 0 ? 0x08 : 0) | (note.effect.ghostNote ? 0x04 : 0);
  writer.writeUnsignedByte(flags).writeUnsignedByte(noteType(note, isTied));
  writeDynamicAndFret(writer, note, flags);
  if (effectFlags === 0) {
    return;
  }
  writer.writeUnsignedByte(effectFlags);
  if (note.effect.bend !== undefined && (effectFlags & 0x01) !== 0) {
    writeBendCurve(writer, note.effect.bend, 'bend');
  }
  if (note.effect.grace !== undefined) {
    writeGraceGp34(writer, note.effect.grace);
  }
}

export const GP3_DIALECT: Gp34Dialect = {
  version: 'FICHIER GUITAR PRO v3.00',
  hasLyrics: false,
  trailingZeros: 4,
  writeChord: writeChordGp3,
  hasBeatEffects: (beat, notes) => beatEffectFlags(beat, gp3BeatEffects(notes)) !== 0,
  writeBeatEffects: writeBeatEffectsGp3,
  writeMixChange: (writer, tempo) => writer.writeBytes(MIX_TABLE_UNCHANGED).writeInt(tempo).writeByte(0),
  writeNote: writeNoteGp3,
};
