// Port of TuxGuitar app.tuxguitar.io.gtp.GP4OutputStream#writeChord / #writeMixChange (LGPL-2.1): what GP4 beats write.
import type { Chord } from '../model/song';
import type { ByteWriter } from './byte-writer';
import type { Gp34Dialect } from './gp34-beats';
import { hasBeatEffects, voiceEffects, writeBeatEffectsGp45 } from './gp45-beat-effects';
import { writeNoteGp45 } from './gp45-notes';

const CHORD_NAME_SIZE = 21;
const CHORD_FRETS = 7;
/** Instrument and the six mixer values: -1 = unchanged. */
const MIX_TABLE_UNCHANGED = [-1, -1, -1, -1, -1, -1, -1] as const;

/** GP4 chord diagram (first byte 1): header, name, first fret, seven frets, barres and fingering. */
function writeChordGp4(writer: ByteWriter, chord: Chord): void {
  writer.writeUnsignedByte(0x01).skipBytes(16).writeStringByte(chord.name, CHORD_NAME_SIZE).skipBytes(4);
  writer.writeInt(chord.firstFret);
  for (let i = 0; i < CHORD_FRETS; i++) {
    writer.writeInt(chord.frets[i] ?? -1);
  }
  writer.skipBytes(32);
}

/** GP4 mix-table change holding only a tempo (no transition), then the "apply to all tracks" flags. */
function writeMixChangeGp4(writer: ByteWriter, tempo: number): void {
  writer.writeBytes(MIX_TABLE_UNCHANGED).writeInt(tempo).writeByte(0).writeByte(0);
}

export const GP4_DIALECT: Gp34Dialect = {
  version: 'FICHIER GUITAR PRO v4.06',
  hasLyrics: true,
  trailingZeros: 0,
  writeChord: writeChordGp4,
  hasBeatEffects: (beat, notes) => hasBeatEffects(beat, voiceEffects(notes)),
  writeBeatEffects: (writer, beat, notes) => writeBeatEffectsGp45(writer, beat, voiceEffects(notes), 'down'),
  writeMixChange: writeMixChangeGp4,
  writeNote: (writer, note, isTied) => writeNoteGp45(writer, note, isTied, 'gp4'),
};
