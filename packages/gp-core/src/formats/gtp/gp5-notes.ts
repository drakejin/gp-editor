// Port of TuxGuitar app.tuxguitar.io.gtp.GP5InputStream (LGPL-2.1): a note, its effects, grace note, slides and harmonic.
import type { ByteReader } from '../../io/byte-reader';
import { DEFAULT_NOTE_AUDIO, toNoteAudio } from '../../model/defaults';
import type { Grace, Harmonic, Note, NoteAudio, NoteEffect, SlideType } from '../../model/song';
import { bendValueFromGp } from '../common/bend-units';
import { GRACE_TRANSITIONS } from '../common/gtp-codes';
import { artificialHarmonicOffset } from '../common/harmonics';
import { DEFAULT_VELOCITY, velocityFromGp } from '../common/velocity';
import { type NoteContext, readFingers, resolveFret } from './gtp-beats';
import {
  readBendPoints,
  readTremoloPicking,
  readTrill,
  withBend,
  withHarmonic,
  withTremoloPicking,
  withTrill,
} from './gtp-note-effects';

export function readNoteGp5(reader: ByteReader, context: NoteContext): Note {
  const flags = reader.readUnsignedByte();
  let effect: NoteEffect = {
    ...context.effect,
    accentuatedNote: (flags & 0x40) !== 0,
    heavyAccentuatedNote: (flags & 0x02) !== 0,
    ghostNote: (flags & 0x04) !== 0,
  };
  const noteType = (flags & 0x20) !== 0 ? reader.readUnsignedByte() : 0;
  const isTied = noteType === 0x02;
  if ((flags & 0x20) !== 0) {
    effect = { ...effect, deadNote: noteType === 0x03 };
  }
  const velocity = (flags & 0x10) !== 0 ? velocityFromGp(reader.readByte()) : DEFAULT_VELOCITY;
  const fret = (flags & 0x20) !== 0 ? resolveFret(reader.readByte(), isTied, context.tiedFret) : 0;
  const fingers = (flags & 0x80) !== 0 ? readFingers(reader) : {};
  // Duration percent (a double, 1 = as written): TuxGuitar skips it; it is the note's play duration.
  const durationPercent = (flags & 0x01) !== 0 ? reader.readDouble() * 100 : undefined;
  reader.skip(1); // second flags byte (accidental spelling)
  if ((flags & 0x08) !== 0) {
    effect = readNoteEffectsGp5(reader, effect);
  }
  const note = { fret, velocity, string: context.string, isTied, effect, ...fingers };
  const audio = durationPercent === undefined ? undefined : audioOf(durationPercent, effect);
  return audio === undefined ? note : { ...note, audio };
}

/**
 * The play duration Guitar Pro 5 writes by itself for a staccato (50 %) or palm-muted (75 %) note, as the real files
 * show; 100 for any other note. renderMidi already shortens those notes for the effect.
 */
export function impliedDurationPercent(effect: NoteEffect): number {
  if (effect.staccato) {
    return 50;
  }
  return effect.palmMute ? 75 : 100;
}

/** A note's audio settings from its duration percent; none when the percent is only what its effect implies. */
function audioOf(durationPercent: number, effect: NoteEffect): NoteAudio | undefined {
  return Math.round(durationPercent) === impliedDurationPercent(effect) ? undefined : toNoteAudio({ ...DEFAULT_NOTE_AUDIO, durationPercent });
}

function readNoteEffectsGp5(reader: ByteReader, effect: NoteEffect): NoteEffect {
  const flags1 = reader.readUnsignedByte();
  const flags2 = reader.readUnsignedByte();
  let result = effect;
  if ((flags1 & 0x01) !== 0) {
    result = withBend(result, readBendPoints(reader, bendValueFromGp));
  }
  if ((flags1 & 0x10) !== 0) {
    result = { ...result, grace: readGraceGp5(reader) };
  }
  if ((flags2 & 0x04) !== 0) {
    result = withTremoloPicking(result, readTremoloPicking(reader));
  }
  if ((flags2 & 0x08) !== 0) {
    result = { ...result, slides: slidesGp5(reader.readByte()) };
  }
  if ((flags2 & 0x10) !== 0) {
    result = withHarmonic(result, readHarmonicGp5(reader));
  }
  if ((flags2 & 0x20) !== 0) {
    result = withTrill(result, readTrill(reader));
  }
  return {
    ...result,
    hammer: (flags1 & 0x02) !== 0,
    letRing: (flags1 & 0x08) !== 0,
    vibrato: ((flags2 & 0x40) !== 0 || result.vibrato) && !result.wideVibrato,
    palmMute: (flags2 & 0x02) !== 0,
    staccato: (flags2 & 0x01) !== 0,
  };
}

function readGraceGp5(reader: ByteReader): Grace {
  const fret = reader.readUnsignedByte();
  const velocity = velocityFromGp(reader.readUnsignedByte());
  const transition = GRACE_TRANSITIONS[reader.readByte()] ?? 'none';
  const duration = reader.readUnsignedByte();
  const flags = reader.readUnsignedByte();
  return { fret, duration, velocity, transition, onBeat: (flags & 0x02) !== 0, isDead: (flags & 0x01) !== 0 };
}

const GP5_SLIDE_BITS: readonly (readonly [number, SlideType])[] = [
  [0x01, 'shift'],
  [0x02, 'legato'],
  [0x04, 'outDownwards'],
  [0x08, 'outUpwards'],
  [0x10, 'intoFromBelow'],
  [0x20, 'intoFromAbove'],
];

/** GP5 slide bitmask; TuxGuitar only records "slide", so a mask without known bits stays a shift slide. */
function slidesGp5(mask: number): readonly SlideType[] {
  const slides = GP5_SLIDE_BITS.filter(([bit]) => (mask & bit) !== 0).map(([, slide]) => slide);
  return slides.length > 0 ? slides : ['shift'];
}

function readHarmonicGp5(reader: ByteReader): Harmonic | undefined {
  switch (reader.readByte()) {
    case 1:
      return { type: 'natural', data: 0 };
    case 2:
      reader.skip(3); // harmonic note, accidental, octave — TuxGuitar keeps data 0 (AH12)
      return { type: 'artificial', data: artificialHarmonicOffset(0) };
    case 3:
      return { type: 'tapped', data: reader.readByte() }; // right-hand fret
    case 4:
      return { type: 'pinch', data: 0 };
    case 5:
      return { type: 'semi', data: 0 };
    default:
      return undefined;
  }
}
