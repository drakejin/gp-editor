// Port of TuxGuitar GP3/GP4/GP5OutputStream#writeNote helpers (LGPL-2.1): what the three note layouts share.
import { gpFingerByte } from '../formats/common/fingering';
import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import type { Grace, Note, Trill } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { dynamicFromVelocity, graceTransitionToGp, trillPeriodToGp } from './gp-units';
import { clampFret } from './gtp-song';

const NOTE_TYPE_NORMAL = 1;
const NOTE_TYPE_TIED = 2;
const NOTE_TYPE_DEAD = 3;
/** GP3/GP4 grace notes mark a dead note with this fret. */
const DEAD_GRACE_FRET = 255;

/** Note flag 0x10: Guitar Pro leaves the dynamic out when it is forte (the readers' default). */
export function hasOwnDynamic(note: Note): boolean {
  return note.velocity !== DEFAULT_VELOCITY;
}

/** Note type byte: tied (when the readers give the tie back, see resolveKeptTies), dead or normal. */
export function noteType(note: Note, isTied: boolean): number {
  if (isTied) {
    return NOTE_TYPE_TIED;
  }
  return note.effect.deadNote ? NOTE_TYPE_DEAD : NOTE_TYPE_NORMAL;
}

/** Dynamic (flag 0x10) and fret (flag 0x20) of a note. */
export function writeDynamicAndFret(writer: ByteWriter, note: Note, flags: number): void {
  if ((flags & 0x10) !== 0) {
    writer.writeByte(dynamicFromVelocity(note.velocity));
  }
  writer.writeByte(clampFret(note.fret));
}

/** Note flag 0x80: the note has a left- or right-hand finger. */
export function fingeringFlag(note: Note): number {
  return note.leftFinger !== undefined || note.rightFinger !== undefined ? 0x80 : 0;
}

/** The fingering bytes (flag 0x80, after the fret): left hand, right hand, -1 for none. */
export function writeFingers(writer: ByteWriter, note: Note, flags: number): void {
  if ((flags & 0x80) !== 0) {
    writer.writeByte(gpFingerByte(note.leftFinger)).writeByte(gpFingerByte(note.rightFinger));
  }
}

/** GP3/GP4 grace note: fret (255 = dead), dynamic, transition, duration. */
export function writeGraceGp34(writer: ByteWriter, grace: Grace): void {
  writer
    .writeUnsignedByte(grace.isDead ? DEAD_GRACE_FRET : clampFret(grace.fret))
    .writeUnsignedByte(dynamicFromVelocity(grace.velocity))
    .writeUnsignedByte(graceTransitionToGp(grace.transition))
    .writeUnsignedByte(grace.duration);
}

/** GP5 grace note: fret, dynamic, transition, duration, then dead (0x01) and on-beat (0x02) flags. */
export function writeGraceGp5(writer: ByteWriter, grace: Grace): void {
  writer
    .writeUnsignedByte(clampFret(grace.fret))
    .writeUnsignedByte(dynamicFromVelocity(grace.velocity))
    .writeUnsignedByte(graceTransitionToGp(grace.transition))
    .writeUnsignedByte(grace.duration)
    .writeUnsignedByte((grace.isDead ? 0x01 : 0) | (grace.onBeat ? 0x02 : 0));
}

export function writeTrill(writer: ByteWriter, trill: Trill): void {
  writer.writeByte(clampFret(trill.fret)).writeByte(trillPeriodToGp(trill.duration.value));
}
