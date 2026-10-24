// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream (LGPL-2.1).
import { ByteReader } from '../../io/byte-reader';
import { durationTicks, EMPTY_NOTE_EFFECT, EMPTY_VOICE, NO_STROKE, toNoteValue } from '../../model/defaults';
import type { Beat, Chord, Grace, Note, NoteEffect, Song, TimeSignature, TripletFeel } from '../../model/song';
import { BEND_MAX_POSITION, bendValueFromGp, tremoloBarValueFromGp } from '../common/bend-units';
import { artificialHarmonicOffset } from '../common/harmonics';
import { DEFAULT_RASGUEADO } from '../common/rasgueado';
import { DEFAULT_VELOCITY, velocityFromGp } from '../common/velocity';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import {
  type BeatEffects,
  buildChord,
  type ChannelRegistry,
  type ChannelSlot,
  clefFromTuning,
  findTiedFret,
  GRACE_TRANSITIONS,
  type HeaderDraft,
  type HeaderRead,
  type HeadersRead,
  type MeasureBeats,
  type MeasureJob,
  type NoteContext,
  parseRepeatAlternative,
  readBendPoints,
  readChannelSlots,
  readColor,
  readDuration,
  readFingers,
  readInts,
  readKeySignature,
  readMarker,
  readMeasureHeaders,
  readMixTableValues,
  readSimpleChord,
  readSongInfo,
  readSongMeasures,
  readStringNotes,
  readStrings,
  readStroke,
  readTrackChannel,
  readTrackList,
  resolveFret,
  skipMixTransitions,
  skipVersion,
  type TrackDraft,
  type TrackListRead,
  type TrackLyrics,
  type TrackStep,
  withBend,
} from './shared';

export function readGp3(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  const reader = new ByteReader(bytes, options.charset);
  skipVersion(reader);
  const info = readSongInfo(reader, false);
  const tripletFeel: TripletFeel = reader.readBoolean() ? 'eighth' : 'none';
  const tempo = reader.readInt();
  const keySignature = readKeySignature(reader);
  reader.skip(3);
  const slots = readChannelSlots(reader);
  const measureCount = reader.readInt();
  const trackCount = reader.readInt();
  const headers = readHeadersGp34(reader, measureCount, tripletFeel, keySignature);
  const { tracks, registry } = readTracksGp34(reader, trackCount, slots, undefined);
  const parts = { source: detected, info, registry, ...headers, tracks, tempo };
  return readSongMeasures(parts, (job) => readMeasureGp34(reader, job, GP3_DIALECT));
}

// ---------------------------------------------------------------- GP3/GP4 structure

/** The parts of a beat that differ between GP3 and GP4. */
export interface Gp34Dialect {
  readonly readChord: (reader: ByteReader, stringCount: number) => Chord | undefined;
  readonly readBeatEffects: (reader: ByteReader) => BeatEffects;
  readonly readMixChange: (reader: ByteReader) => number | undefined;
  readonly readNote: (reader: ByteReader, context: NoteContext) => Note;
}

/** GP3/GP4 measure headers; the time signature and key signature carry over from the previous header. */
export function readHeadersGp34(reader: ByteReader, count: number, tripletFeel: TripletFeel, songKey: number): HeadersRead {
  return readMeasureHeaders(count, songKey, (number, previous, timeSignature) =>
    readHeaderGp34(reader, number, previous, timeSignature, tripletFeel),
  );
}

function readHeaderGp34(
  reader: ByteReader,
  number: number,
  previous: readonly HeaderDraft[],
  timeSignature: TimeSignature,
  tripletFeel: TripletFeel,
): HeaderRead {
  const flags = reader.readUnsignedByte();
  const numerator = (flags & 0x01) !== 0 ? reader.readByte() : timeSignature.numerator;
  const denominator = (flags & 0x02) !== 0 ? toNoteValue(reader.readByte()) : timeSignature.denominator;
  const repeatClose = (flags & 0x08) !== 0 ? reader.readByte() : 0;
  const repeatAlternative = (flags & 0x10) !== 0 ? parseRepeatAlternative(previous, reader.readUnsignedByte()) : 0;
  const marker = (flags & 0x20) !== 0 ? readMarker(reader) : undefined;
  const keySignature = (flags & 0x40) !== 0 ? readKeySignature(reader) : undefined;
  if (keySignature !== undefined) {
    reader.skip(1); // major / minor
  }
  const header: HeaderDraft = {
    number,
    timeSignature: { numerator, denominator },
    repeatOpen: (flags & 0x04) !== 0,
    repeatClose,
    repeatAlternative,
    tripletFeel,
    ...(marker === undefined ? {} : { marker }),
  };
  return keySignature === undefined ? { header } : { header, keySignature };
}

export function readTracksGp34(
  reader: ByteReader,
  count: number,
  slots: readonly ChannelSlot[],
  lyrics: TrackLyrics | undefined,
): TrackListRead {
  return readTrackList(count, lyrics, (number, registry) => readTrackGp34(reader, number, slots, registry));
}

function readTrackGp34(
  reader: ByteReader,
  number: number,
  slots: readonly ChannelSlot[],
  registry: ChannelRegistry,
): TrackStep {
  reader.readUnsignedByte(); // flags (percussion / 12-string / banjo) — TuxGuitar ignores them
  const name = reader.readStringByte(40);
  const strings = readStrings(reader);
  reader.readInt(); // MIDI port
  const channel = readTrackChannel(reader, slots, registry);
  reader.readInt(); // fret count
  const offset = reader.readInt();
  const color = readColor(reader);
  const { channelId, isPercussion } = channel;
  const draft: TrackDraft = {
    number,
    name,
    channelId,
    strings,
    color,
    offset,
    isPercussion,
    solo: false,
    mute: false,
  };
  return { track: { draft, clef: clefFromTuning(strings, isPercussion) }, registry: channel.registry };
}

export function readMeasureGp34(reader: ByteReader, job: MeasureJob, dialect: Gp34Dialect): MeasureBeats {
  const count = reader.readInt();
  const beats: Beat[] = [];
  let start = job.start;
  let tempo = job.tempo;
  for (let i = 0; i < count; i++) {
    const read = readBeatGp34(reader, job, dialect, start, beats);
    beats.push(read.beat);
    start += read.ticks;
    tempo = read.tempo ?? tempo;
  }
  return { beats, tempo };
}

interface Gp34BeatRead {
  readonly beat: Beat;
  readonly ticks: number;
  readonly tempo?: number;
}

function readBeatGp34(
  reader: ByteReader,
  job: MeasureJob,
  dialect: Gp34Dialect,
  start: number,
  beats: readonly Beat[],
): Gp34BeatRead {
  const flags = reader.readUnsignedByte();
  if ((flags & 0x40) !== 0) {
    reader.readUnsignedByte(); // beat status: TuxGuitar reads empty beats as rests
  }
  const duration = readDuration(reader, flags, false);
  const stringCount = job.track.draft.strings.length;
  const chord = (flags & 0x02) !== 0 ? dialect.readChord(reader, stringCount) : undefined;
  const text = (flags & 0x04) !== 0 ? reader.readStringByteSizeOfInteger() : undefined;
  const effects: BeatEffects = (flags & 0x08) !== 0 ? dialect.readBeatEffects(reader) : { effect: EMPTY_NOTE_EFFECT };
  const tempo = (flags & 0x10) !== 0 ? dialect.readMixChange(reader) : undefined;
  const notes = readStringNotes(reader, stringCount, (string) =>
    dialect.readNote(reader, { string, effect: effects.effect, tiedFret: () => findTiedFret(job.previous, beats, string) }),
  );
  const beat: Beat = {
    start,
    voices: [{ duration, notes, isEmpty: false, direction: 'none' }, EMPTY_VOICE],
    stroke: effects.stroke ?? NO_STROKE,
    pickStroke: effects.pickStroke ?? 'none',
    ...(chord === undefined ? {} : { chord }),
    ...(text === undefined ? {} : { text }),
    ...(effects.isRasgueado === true ? { rasgueado: DEFAULT_RASGUEADO } : {}),
  };
  return { beat, ticks: durationTicks(duration), ...(tempo === undefined ? {} : { tempo }) };
}

/** GP3/GP4 note; GP4 adds the accent flag. Effects are read by `readEffects` (fret = the note's fret). */
export function readNoteGp34(
  reader: ByteReader,
  context: NoteContext,
  hasAccent: boolean,
  readEffects: (reader: ByteReader, effect: NoteEffect, fret: number) => NoteEffect,
): Note {
  const flags = reader.readUnsignedByte();
  let effect: NoteEffect = {
    ...context.effect,
    ghostNote: (flags & 0x04) !== 0,
    ...(hasAccent ? { accentuatedNote: (flags & 0x40) !== 0 } : {}),
  };
  const noteType = (flags & 0x20) !== 0 ? reader.readUnsignedByte() : 0;
  const isTied = noteType === 0x02;
  if ((flags & 0x20) !== 0) {
    effect = { ...effect, deadNote: noteType === 0x03 };
  }
  if ((flags & 0x01) !== 0) {
    reader.skip(2); // time-independent duration
  }
  const velocity = (flags & 0x10) !== 0 ? velocityFromGp(reader.readByte()) : DEFAULT_VELOCITY;
  const fret = (flags & 0x20) !== 0 ? resolveFret(reader.readByte(), isTied, context.tiedFret) : 0;
  const fingers = (flags & 0x80) !== 0 ? readFingers(reader) : {};
  if ((flags & 0x08) !== 0) {
    effect = readEffects(reader, effect, fret);
  }
  return { fret, velocity, string: context.string, isTied, effect, ...fingers };
}

/** GP3/GP4 grace note: fret (255 = dead), dynamic, transition, duration. */
export function readGraceGp34(reader: ByteReader): Grace {
  const fret = reader.readUnsignedByte();
  const isDead = fret === 255;
  const velocity = velocityFromGp(reader.readUnsignedByte());
  const transition = GRACE_TRANSITIONS[reader.readUnsignedByte()] ?? 'none';
  const duration = reader.readUnsignedByte();
  return { fret: isDead ? 0 : fret, duration, velocity, transition, onBeat: false, isDead };
}

/** GP3/GP4 mix-table change; only the tempo is kept (TuxGuitar's readMixChange). */
export function readMixChangeGp3(reader: ByteReader): number | undefined {
  reader.readByte(); // instrument
  const values = readMixTableValues(reader);
  const tempo = reader.readInt();
  skipMixTransitions(reader, values);
  if (tempo < 0) {
    return undefined;
  }
  reader.readByte(); // tempo transition duration
  return tempo;
}

// ---------------------------------------------------------------- GP3 dialect

function readChordGp3(reader: ByteReader, stringCount: number): Chord | undefined {
  if ((reader.readUnsignedByte() & 0x01) === 0) {
    return readSimpleChord(reader, stringCount);
  }
  reader.skip(25);
  const name = reader.readStringByte(34);
  const firstFret = reader.readInt();
  const frets = readInts(reader, 6);
  reader.skip(36);
  return buildChord(name, firstFret, frets, stringCount);
}

const NATURAL_HARMONIC = { type: 'natural', data: 0 } as const;
/** GP3 artificial harmonics are TuxGuitar data 0 (AH12). */
const GP3_ARTIFICIAL_HARMONIC = { type: 'artificial', data: artificialHarmonicOffset(0) } as const;

/** GP3 beat effects. 0x01 is vibrato, 0x02 wide vibrato: TuxGuitar reads both as vibrato, the model keeps wide (it wins). */
function readBeatEffectsGp3(reader: ByteReader): BeatEffects {
  const flags = reader.readUnsignedByte();
  let effect: NoteEffect = {
    ...EMPTY_NOTE_EFFECT,
    vibrato: (flags & 0x01) !== 0 && (flags & 0x02) === 0,
    wideVibrato: (flags & 0x02) !== 0,
    fadeIn: (flags & 0x10) !== 0,
  };
  if ((flags & 0x20) !== 0) {
    effect = readSpecialEffectGp3(reader, effect);
  }
  const stroke = (flags & 0x40) !== 0 ? readStroke(reader, 'down') : undefined;
  if ((flags & 0x04) !== 0) {
    effect = { ...effect, harmonic: NATURAL_HARMONIC };
  }
  if ((flags & 0x08) !== 0) {
    effect = { ...effect, harmonic: GP3_ARTIFICIAL_HARMONIC };
  }
  return stroke === undefined ? { effect } : { effect, stroke };
}

/** Type 0 is a tremolo bar dive (one value); 1/2/3 are tapping/slapping/popping with an unused value. */
function readSpecialEffectGp3(reader: ByteReader, effect: NoteEffect): NoteEffect {
  const type = reader.readUnsignedByte();
  const value = reader.readInt();
  if (type === 0) {
    const dive = tremoloBarValueFromGp(-value);
    const points = [
      { position: 0, value: 0 },
      { position: Math.round(BEND_MAX_POSITION / 2), value: dive },
      { position: BEND_MAX_POSITION, value: 0 },
    ];
    return { ...effect, tremoloBar: { points } };
  }
  return { ...effect, tapping: type === 1, slapping: type === 2, popping: type === 3 };
}

function readNoteEffectsGp3(reader: ByteReader, effect: NoteEffect): NoteEffect {
  const flags = reader.readUnsignedByte();
  let result: NoteEffect = {
    ...effect,
    hammer: (flags & 0x02) !== 0,
    slides: (flags & 0x04) !== 0 ? ['shift'] : [],
    letRing: (flags & 0x08) !== 0,
  };
  if ((flags & 0x01) !== 0) {
    result = withBend(result, readBendPoints(reader, bendValueFromGp));
  }
  if ((flags & 0x10) !== 0) {
    result = { ...result, grace: readGraceGp34(reader) };
  }
  return result;
}

const GP3_DIALECT: Gp34Dialect = {
  readChord: readChordGp3,
  readBeatEffects: readBeatEffectsGp3,
  readMixChange: readMixChangeGp3,
  readNote: (reader, context) => readNoteGp34(reader, context, false, readNoteEffectsGp3),
};
