// Port of TuxGuitar app.tuxguitar.io.gtp.GP4InputStream (LGPL-2.1).
import { ByteReader } from '../../io/byte-reader';
import { EMPTY_NOTE_EFFECT } from '../../model/defaults';
import type { Chord, Harmonic, NoteEffect, SlideType, Song, TripletFeel } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import {
  type Gp34Dialect,
  readGraceGp34,
  readHeadersGp34,
  readMeasureGp34,
  readMixChangeGp3,
  readNoteGp34,
  readTracksGp34,
} from './gp3';
import {
  artificialHarmonicOffset,
  type BeatEffects,
  bendValue,
  buildChord,
  harmonicFretOffset,
  readBendPoints,
  readChannelSlots,
  readInts,
  readKeySignature,
  readLyrics,
  readPickStroke,
  readSimpleChord,
  readSongInfo,
  readSongMeasures,
  readStroke,
  readTremoloPicking,
  readTrill,
  skipVersion,
  tremoloBarValue,
  withBend,
  withHarmonic,
  withTremoloBar,
  withTremoloPicking,
  withTrill,
} from './shared';

export function readGp4(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  const reader = new ByteReader(bytes, options.charset);
  skipVersion(reader);
  const info = readSongInfo(reader, false);
  const tripletFeel: TripletFeel = reader.readBoolean() ? 'eighth' : 'none';
  const lyricTrack = reader.readInt();
  const lyrics = readLyrics(reader);
  const tempo = reader.readInt();
  const keySignature = readKeySignature(reader);
  reader.skip(3);
  reader.readByte(); // octave
  const slots = readChannelSlots(reader);
  const measureCount = reader.readInt();
  const trackCount = reader.readInt();
  const headers = readHeadersGp34(reader, measureCount, tripletFeel, keySignature);
  const { tracks, registry } = readTracksGp34(reader, trackCount, slots, { lyricTrack, lyrics });
  const parts = { source: detected, info, registry, ...headers, tracks, tempo };
  return readSongMeasures(parts, (job) => readMeasureGp34(reader, job, GP4_DIALECT));
}

/** GP4 chord: a "simple" chord (name and six frets) or a full diagram. */
function readChordGp4(reader: ByteReader, stringCount: number): Chord | undefined {
  if ((reader.readUnsignedByte() & 0x01) === 0) {
    return readSimpleChord(reader, stringCount);
  }
  reader.skip(16);
  const name = reader.readStringByte(21);
  reader.skip(4);
  const firstFret = reader.readInt();
  const frets = readInts(reader, 7);
  reader.skip(32);
  return buildChord(name, firstFret, frets, stringCount);
}

/** GP4/GP5 beat effects. GP4 writes the stroke "down" byte first, GP5 "up". */
export function readBeatEffectsGp45(reader: ByteReader, firstStroke: 'up' | 'down'): BeatEffects {
  const flags1 = reader.readUnsignedByte();
  const flags2 = reader.readUnsignedByte();
  let effect: NoteEffect = { ...EMPTY_NOTE_EFFECT, fadeIn: (flags1 & 0x10) !== 0, vibrato: (flags1 & 0x02) !== 0 };
  if ((flags1 & 0x20) !== 0) {
    const type = reader.readUnsignedByte();
    effect = { ...effect, tapping: type === 1, slapping: type === 2, popping: type === 3 };
  }
  if ((flags2 & 0x04) !== 0) {
    effect = withTremoloBar(effect, readBendPoints(reader, tremoloBarValue));
  }
  const stroke = (flags1 & 0x40) !== 0 ? readStroke(reader, firstStroke) : undefined;
  const pickStroke = (flags2 & 0x02) !== 0 ? readPickStroke(reader) : undefined;
  return {
    effect,
    ...(stroke === undefined ? {} : { stroke }),
    ...(pickStroke === undefined ? {} : { pickStroke }),
  };
}

function readMixChangeGp4(reader: ByteReader): number | undefined {
  const tempo = readMixChangeGp3(reader);
  reader.readByte(); // "apply to all tracks" flags
  return tempo;
}

/** GP4 note effects: two flag bytes, then the data of each effect that is set. */
function readNoteEffectsGp4(reader: ByteReader, effect: NoteEffect, fret: number): NoteEffect {
  const flags1 = reader.readUnsignedByte();
  const flags2 = reader.readUnsignedByte();
  let result: NoteEffect = {
    ...effect,
    hammer: (flags1 & 0x02) !== 0,
    letRing: (flags1 & 0x08) !== 0,
    vibrato: (flags2 & 0x40) !== 0 || effect.vibrato,
    palmMute: (flags2 & 0x02) !== 0,
    staccato: (flags2 & 0x01) !== 0,
  };
  if ((flags1 & 0x01) !== 0) {
    result = withBend(result, readBendPoints(reader, bendValue));
  }
  if ((flags1 & 0x10) !== 0) {
    result = { ...result, grace: readGraceGp34(reader) };
  }
  if ((flags2 & 0x04) !== 0) {
    result = withTremoloPicking(result, readTremoloPicking(reader));
  }
  if ((flags2 & 0x08) !== 0) {
    result = { ...result, slides: slidesGp4(reader.readByte()) };
  }
  if ((flags2 & 0x10) !== 0) {
    result = withHarmonic(result, harmonicGp4(reader.readByte(), fret));
  }
  if ((flags2 & 0x20) !== 0) {
    result = withTrill(result, readTrill(reader));
  }
  return result;
}

const GP4_SLIDES: ReadonlyMap<number, SlideType> = new Map<number, SlideType>([
  [1, 'shift'],
  [2, 'legato'],
  [3, 'outDownwards'],
  [4, 'outUpwards'],
  [-1, 'intoFromBelow'],
  [-2, 'intoFromAbove'],
]);

/** TuxGuitar only records "slide"; an unknown type stays a plain (shift) slide. */
function slidesGp4(type: number): readonly SlideType[] {
  return [GP4_SLIDES.get(type) ?? 'shift'];
}

/** GP4 harmonic byte; artificial types carry the touch fret (TuxGuitar data index 2, 3, 0). */
function harmonicGp4(type: number, fret: number): Harmonic | undefined {
  switch (type) {
    case 1:
      return { type: 'natural', data: 0 };
    case 3:
      // GP4 stores no tap fret; TuxGuitar's data 0 means 12 frets above the note.
      return { type: 'tapped', data: fret + harmonicFretOffset(0) };
    case 4:
      return { type: 'pinch', data: 0 };
    case 5:
      return { type: 'semi', data: 0 };
    case 15:
      return { type: 'artificial', data: artificialHarmonicOffset(2) };
    case 17:
      return { type: 'artificial', data: artificialHarmonicOffset(3) };
    case 22:
      return { type: 'artificial', data: artificialHarmonicOffset(0) };
    default:
      return undefined;
  }
}

const GP4_DIALECT: Gp34Dialect = {
  readChord: readChordGp4,
  readBeatEffects: (reader) => readBeatEffectsGp45(reader, 'down'),
  readMixChange: readMixChangeGp4,
  readNote: (reader, context) => readNoteGp34(reader, context, true, readNoteEffectsGp4),
};
