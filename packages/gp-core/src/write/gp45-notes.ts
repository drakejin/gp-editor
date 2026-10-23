// Port of TuxGuitar GP4OutputStream/GP5OutputStream#writeNote / #writeNoteEffects (LGPL-2.1).
import type { Harmonic, Note, NoteEffect, SlideType } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { writeBendCurve } from './gp-bends';
import { tremoloPickingSpeedToGp } from './gp-units';
import { clampFret } from './gtp-song';
import { hasOwnDynamic, noteType, writeDynamicAndFret, writeGraceGp34, writeGraceGp5, writeTrill } from './gtp-notes';

export type Gp45Version = 'gp4' | 'gp5';

/** GP5 slide bits (the reader's GP5_SLIDE_BITS). */
const GP5_SLIDE_BITS: Readonly<Record<SlideType, number>> = {
  shift: 0x01,
  legato: 0x02,
  outDownwards: 0x04,
  outUpwards: 0x08,
  intoFromBelow: 0x10,
  intoFromAbove: 0x20,
};

/** GP4 slide types (the reader's GP4_SLIDES): one slide per note. */
const GP4_SLIDE_TYPES: Readonly<Record<SlideType, number>> = {
  shift: 1,
  legato: 2,
  outDownwards: 3,
  outUpwards: 4,
  intoFromBelow: -1,
  intoFromAbove: -2,
};

/** GP4 artificial harmonic types by semitones above the note (the reader's harmonicGp4: 15, 17, 22). */
const GP4_ARTIFICIAL_HARMONICS: readonly (readonly [number, number])[] = [
  [12, 22],
  [19, 17],
  [24, 15],
];

/** GP4/GP5 harmonic types without data (artificial and tapped carry data in GP5). */
const SIMPLE_HARMONICS: Readonly<Record<Harmonic['type'], number>> = { natural: 1, artificial: 2, tapped: 3, pinch: 4, semi: 5 };

export function hasNoteEffects(effect: NoteEffect): boolean {
  const [flags1, flags2] = effectFlags(effect);
  return flags1 !== 0 || flags2 !== 0;
}

function noteFlags(note: Note, version: Gp45Version): number {
  const { effect } = note;
  return (
    0x20 | // note type and fret
    (hasOwnDynamic(note) ? 0x10 : 0) |
    (hasNoteEffects(effect) ? 0x08 : 0) |
    (effect.ghostNote ? 0x04 : 0) |
    (version === 'gp5' && effect.heavyAccentuatedNote ? 0x02 : 0) |
    (version === 'gp5' && note.audio !== undefined && note.audio.durationPercent !== 100 ? 0x01 : 0) |
    (effect.accentuatedNote ? 0x40 : 0)
  );
}

/**
 * GP4/GP5 note: flags, type, dynamic (unless forte), fret, (GP5: duration percent — a note's play duration, the only
 * audio setting GP5 keeps —, accidental flags byte), effects.
 */
export function writeNoteGp45(writer: ByteWriter, note: Note, isTied: boolean, version: Gp45Version): void {
  const flags = noteFlags(note, version);
  writer.writeUnsignedByte(flags).writeUnsignedByte(noteType(note, isTied));
  writeDynamicAndFret(writer, note, flags);
  if ((flags & 0x01) !== 0) {
    writer.writeDouble((note.audio?.durationPercent ?? 100) / 100);
  }
  if (version === 'gp5') {
    writer.writeByte(0);
  }
  if ((flags & 0x08) !== 0) {
    writeNoteEffectsGp45(writer, note.effect, version);
  }
}

function effectFlags(effect: NoteEffect): readonly [number, number] {
  const flags1 =
    ((effect.bend?.points.length ?? 0) > 0 ? 0x01 : 0) |
    (effect.hammer ? 0x02 : 0) |
    (effect.letRing ? 0x08 : 0) |
    (effect.grace !== undefined ? 0x10 : 0);
  const flags2 =
    (effect.staccato ? 0x01 : 0) |
    (effect.palmMute ? 0x02 : 0) |
    (effect.tremoloPicking !== undefined ? 0x04 : 0) |
    (effect.slides.length > 0 ? 0x08 : 0) |
    (effect.harmonic !== undefined ? 0x10 : 0) |
    (effect.trill !== undefined ? 0x20 : 0) |
    (effect.vibrato ? 0x40 : 0);
  return [flags1, flags2];
}

function writeNoteEffectsGp45(writer: ByteWriter, effect: NoteEffect, version: Gp45Version): void {
  const [flags1, flags2] = effectFlags(effect);
  writer.writeUnsignedByte(flags1).writeUnsignedByte(flags2);
  if (effect.bend !== undefined && (flags1 & 0x01) !== 0) {
    writeBendCurve(writer, effect.bend, 'bend');
  }
  if (effect.grace !== undefined) {
    (version === 'gp5' ? writeGraceGp5 : writeGraceGp34)(writer, effect.grace);
  }
  if (effect.tremoloPicking !== undefined) {
    writer.writeByte(tremoloPickingSpeedToGp(effect.tremoloPicking.duration.value));
  }
  const [slide] = effect.slides;
  if (slide !== undefined) {
    writer.writeByte(version === 'gp5' ? effect.slides.reduce((mask, s) => mask | GP5_SLIDE_BITS[s], 0) : GP4_SLIDE_TYPES[slide]);
  }
  if (effect.harmonic !== undefined) {
    (version === 'gp5' ? writeHarmonicGp5 : writeHarmonicGp4)(writer, effect.harmonic);
  }
  if (effect.trill !== undefined) {
    writeTrill(writer, effect.trill);
  }
}

/**
 * GP5 harmonic types: 1 natural, 2 artificial (+ harmonic note, accidental, octave — the reader keeps
 * AH12 whatever they hold, so they are written as TuxGuitar does), 3 tapped (+ the tapped fret),
 * 4 pinch, 5 semi.
 */
function writeHarmonicGp5(writer: ByteWriter, harmonic: Harmonic): void {
  switch (harmonic.type) {
    case 'artificial':
      writer.writeByte(2).writeBytes([0, 0, 0]);
      return;
    case 'tapped':
      writer.writeByte(3).writeByte(clampFret(harmonic.data));
      return;
    default:
      writer.writeByte(SIMPLE_HARMONICS[harmonic.type]);
  }
}

/**
 * GP4 harmonic byte: 1 natural, 3 tapped (the reader taps 12 frets above the note), 4 pinch, 5 semi,
 * and an artificial harmonic by its interval (22 = octave, 17 = octave + fifth, 15 = two octaves; the
 * nearest one for other intervals).
 */
function writeHarmonicGp4(writer: ByteWriter, harmonic: Harmonic): void {
  if (harmonic.type !== 'artificial') {
    writer.writeByte(SIMPLE_HARMONICS[harmonic.type]);
    return;
  }
  const nearest = GP4_ARTIFICIAL_HARMONICS.reduce((best, entry) =>
    Math.abs(entry[0] - harmonic.data) < Math.abs(best[0] - harmonic.data) ? entry : best,
  );
  writer.writeByte(nearest[1]);
}
