// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1).
import { GpFormatError, errorMessage } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';
import {
  DEFAULT_PERCUSSION_BANK,
  DEFAULT_PERCUSSION_CHANNEL,
  measureTicks,
  NORMAL_TUPLET,
  plainDuration,
  toNoteValue,
} from '../../model/defaults';
import { QUARTER_TIME } from '../../model/song';
import type {
  Beat,
  BendPoint,
  Chord,
  Channel,
  Clef,
  Duration,
  GuitarString,
  Lyrics,
  Marker,
  Measure,
  MeasureHeader,
  Note,
  NoteEffect,
  Rgb,
  Song,
  SongInfo,
  SourceInfo,
  Stroke,
  StrokeDirection,
  TimeSignature,
  Track,
  TremoloPicking,
  Trill,
  Tuplet,
} from '../../model/song';
import { bendPositionFromGp } from '../common/bend-units';
import { createChannelName } from '../common/channels';
import { fingerFromGp } from '../common/fingering';
import { GTP_VERSION_BLOCK } from '../detect';
import { normalizeSong } from './normalize';

/** GP3–GP5 bend positions run 0…60. */
const GP_BEND_POSITION = 60;

const GTP_CHANNEL_COUNT = 64;
/** Frets read for tied notes must be below this, else TuxGuitar uses 0. */
const MAX_TIED_FRET = 100;
const STRING_SLOTS = 7;
/** Strings tuned at or below this MIDI pitch get a bass clef (GP3/GP4). */
const BASS_CLEF_TUNING = 34;

/** Wraps any failure of `read` in a GpFormatError that says where it happened. */
export function withContext<T>(context: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw new GpFormatError(`${context}: ${errorMessage(error)}`, { cause: error });
  }
}

export function skipVersion(reader: ByteReader): void {
  reader.readStringByte(GTP_VERSION_BLOCK);
}

export function readInts(reader: ByteReader, count: number): readonly number[] {
  return Array.from({ length: count }, () => reader.readInt());
}

// ---------------------------------------------------------------- song info

/** GP3/GP4 have one "author" string, used for both words and music; GP5 has both. */
export function readSongInfo(reader: ByteReader, hasMusicField: boolean): SongInfo {
  const read = (): string => reader.readStringByteSizeOfInteger();
  const title = read();
  const subtitle = read();
  const artist = read();
  const album = read();
  const words = read();
  const music = hasMusicField ? read() : words;
  const copyright = read();
  const transcriber = read();
  const instructions = read();
  const noticeCount = reader.readInt();
  const notice = Array.from({ length: Math.max(0, noticeCount) }, read);
  return { title, subtitle, artist, album, words, music, copyright, transcriber, instructions, notice };
}

/** GP4/GP5 lyrics: the first of the five lines is kept, as in TuxGuitar. */
export function readLyrics(reader: ByteReader): Lyrics {
  const from = reader.readInt();
  const text = reader.readStringInteger();
  for (let i = 0; i < 4; i++) {
    reader.readInt();
    reader.readStringInteger();
  }
  return { from, text };
}

export function readKeySignature(reader: ByteReader): number {
  // TuxGuitar re-encodes flats as 8…14; the model keeps the signed count (-7…7).
  return reader.readByte();
}

export function readColor(reader: ByteReader): Rgb {
  const r = reader.readUnsignedByte();
  const g = reader.readUnsignedByte();
  const b = reader.readUnsignedByte();
  reader.skip(1);
  return { r, g, b };
}

export function readMarker(reader: ByteReader): Marker {
  const title = reader.readStringByteSizeOfInteger();
  return { title, color: readColor(reader) };
}

// ---------------------------------------------------------------- channels

/** One of the 64 MIDI channel settings stored in the file header. */
export type ChannelSlot = Omit<Channel, 'id' | 'name'>;

function toChannelValue(value: number): number {
  return Math.max(value * 8 - 1, 0);
}

export function readChannelSlots(reader: ByteReader): readonly ChannelSlot[] {
  return Array.from({ length: GTP_CHANNEL_COUNT }, (_, index) => {
    const program = reader.readInt();
    const [volume, balance, chorus, reverb, phaser, tremolo] = Array.from({ length: 6 }, () =>
      toChannelValue(reader.readByte()),
    );
    reader.skip(2);
    const bank = index === DEFAULT_PERCUSSION_CHANNEL ? DEFAULT_PERCUSSION_BANK : 0;
    return {
      program: Math.max(0, program),
      bank,
      volume: volume ?? 0,
      balance: balance ?? 0,
      chorus: chorus ?? 0,
      reverb: reverb ?? 0,
      phaser: phaser ?? 0,
      tremolo: tremolo ?? 0,
      isPercussion: bank === DEFAULT_PERCUSSION_BANK,
    };
  });
}

/** Song channels created so far, with the GM channel (0-based) each was made for. */
export interface ChannelRegistry {
  readonly channels: readonly Channel[];
  /** Channel id → GM channel 1 (TuxGuitar's PARAMETER_GM_CHANNEL_1). */
  readonly gmChannels: ReadonlyMap<number, number>;
}

const EMPTY_REGISTRY: ChannelRegistry = { channels: [], gmChannels: new Map() };

/** TGTrack's channel id when the file names no valid channel. */
const NO_CHANNEL = -1;

/**
 * Tracks on the same GM channel share one song channel (TuxGuitar's readChannel).
 * The port number is ignored, as in TuxGuitar: channel N of any port uses slot N.
 */
export function assignChannel(
  registry: ChannelRegistry,
  slots: readonly ChannelSlot[],
  gmChannel: number,
): { readonly registry: ChannelRegistry; readonly channelId: number } {
  const slot = gmChannel >= 0 ? slots[gmChannel] : undefined;
  if (slot === undefined) {
    return { registry, channelId: NO_CHANNEL };
  }
  const existing = [...registry.gmChannels].filter(([, gm]) => gm === gmChannel).pop();
  if (existing !== undefined) {
    return { registry, channelId: existing[0] };
  }
  const id = registry.channels.length + 1;
  const channel: Channel = { id, name: createChannelName(registry.channels, slot.program, slot.isPercussion), ...slot };
  return {
    registry: { channels: [...registry.channels, channel], gmChannels: new Map([...registry.gmChannels, [id, gmChannel]]) },
    channelId: id,
  };
}

// ---------------------------------------------------------------- measure headers and tracks

/** A measure header before its start and tempo are known (they come from reading the measures). */
export type HeaderDraft = Omit<MeasureHeader, 'start' | 'tempo'>;

/** A track before its measures are read. */
export type TrackDraft = Omit<Track, 'measures'>;

/** GP3/GP4 alternate endings: a count, turned into the endings not used since the last repeat open. */
export function parseRepeatAlternative(previous: readonly HeaderDraft[], value: number): number {
  let existing = 0;
  for (const header of previous) {
    if (header.repeatOpen) {
      existing = 0;
    }
    existing |= header.repeatAlternative;
  }
  let alternative = 0;
  for (let i = 0; i < 8; i++) {
    if (value > i && (existing & (1 << i)) === 0) {
      alternative |= 1 << i;
    }
  }
  return alternative;
}

export interface HeaderRead {
  readonly header: HeaderDraft;
  /** Set when the header changes the key signature. */
  readonly keySignature?: number;
}

export interface HeadersRead {
  readonly headers: readonly HeaderDraft[];
  /** Key signature per measure (carried over from the previous measure). */
  readonly keySignatures: readonly number[];
}

export type ReadHeader = (number: number, previous: readonly HeaderDraft[], timeSignature: TimeSignature) => HeaderRead;

/** Reads `count` headers; time and key signature carry over (TuxGuitar's readMeasureHeaders). */
export function readMeasureHeaders(count: number, songKey: number, readHeader: ReadHeader): HeadersRead {
  const headers: HeaderDraft[] = [];
  const keySignatures: number[] = [];
  let timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
  let keySignature = songKey;
  for (let index = 0; index < count; index++) {
    const read = withContext(`measure header ${index + 1}`, () => readHeader(index + 1, headers, timeSignature));
    timeSignature = read.header.timeSignature;
    keySignature = read.keySignature ?? keySignature;
    headers.push(read.header);
    keySignatures.push(keySignature);
  }
  return { headers, keySignatures };
}

/** A track before its measures are read, plus the clef its measures get. */
export interface TrackRead {
  readonly draft: TrackDraft;
  readonly clef: Clef;
}

/** GP4/GP5 lyrics belong to one track (`lyricTrack`, 1-based). */
export interface TrackLyrics {
  readonly lyricTrack: number;
  readonly lyrics: Lyrics;
}

export interface TrackStep {
  readonly track: TrackRead;
  readonly registry: ChannelRegistry;
}

export interface TrackListRead {
  readonly tracks: readonly TrackRead[];
  readonly registry: ChannelRegistry;
}

/** Reads tracks 1…count; each may add a song channel. The lyric track gets the lyrics. */
export function readTrackList(
  count: number,
  lyrics: TrackLyrics | undefined,
  readTrack: (number: number, registry: ChannelRegistry) => TrackStep,
): TrackListRead {
  const tracks: TrackRead[] = [];
  let registry = EMPTY_REGISTRY;
  for (let number = 1; number <= count; number++) {
    const step = withContext(`track ${number}`, () => readTrack(number, registry));
    registry = step.registry;
    const trackLyrics = lyrics?.lyricTrack === number ? lyrics.lyrics : undefined;
    const draft = trackLyrics === undefined ? step.track.draft : { ...step.track.draft, lyrics: trackLyrics };
    tracks.push({ ...step.track, draft });
  }
  return { tracks, registry };
}

export function readStrings(reader: ByteReader): readonly GuitarString[] {
  const count = reader.readInt();
  const tunings = readInts(reader, STRING_SLOTS);
  return tunings.slice(0, Math.max(0, count)).map((tuning, index) => ({ number: index + 1, tuning }));
}

/** Reads the two GM channel numbers of a track and assigns its song channel. */
export function readTrackChannel(
  reader: ByteReader,
  slots: readonly ChannelSlot[],
  registry: ChannelRegistry,
): { readonly registry: ChannelRegistry; readonly channelId: number; readonly isPercussion: boolean } {
  const gmChannel = reader.readInt() - 1;
  reader.readInt(); // effect channel (TuxGuitar's GM channel 2) — no place in the model
  const assigned = assignChannel(registry, slots, gmChannel);
  const channel = assigned.registry.channels.find((candidate) => candidate.id === assigned.channelId);
  return { ...assigned, isPercussion: channel?.isPercussion ?? false };
}

/** GP3/GP4 clef: bass when any string is tuned low enough, treble otherwise and for percussion. */
export function clefFromTuning(strings: readonly GuitarString[], isPercussion: boolean): Clef {
  return !isPercussion && strings.some((guitarString) => guitarString.tuning <= BASS_CLEF_TUNING) ? 'bass' : 'treble';
}

// ---------------------------------------------------------------- beats

const TUPLETS: ReadonlyMap<number, Tuplet> = new Map<number, Tuplet>([
  [3, { enters: 3, times: 2 }],
  [5, { enters: 5, times: 4 }],
  [6, { enters: 6, times: 4 }],
  [7, { enters: 7, times: 4 }],
  [9, { enters: 9, times: 8 }],
  [10, { enters: 10, times: 8 }],
  [11, { enters: 11, times: 8 }],
  [12, { enters: 12, times: 8 }],
  [13, { enters: 13, times: 8 }],
]);
const GP5_ONLY_TUPLET = 13;

/** Beat duration: a signed exponent (-2 = whole … 4 = 64th) and, with flag 0x20, a tuplet. */
export function readDuration(reader: ByteReader, flags: number, allowThirteen: boolean): Duration {
  const value = toNoteValue(Math.trunc(2 ** (reader.readByte() + 4) / 4));
  let tuplet = NORMAL_TUPLET;
  if ((flags & 0x20) !== 0) {
    const division = reader.readInt();
    const allowed = division !== GP5_ONLY_TUPLET || allowThirteen;
    tuplet = allowed ? (TUPLETS.get(division) ?? NORMAL_TUPLET) : NORMAL_TUPLET;
  }
  return { value, dotted: (flags & 0x01) !== 0, doubleDotted: false, tuplet };
}

/** Beat effects: the note effects every note of the beat starts from, plus the beat's strokes. */
export interface BeatEffects {
  readonly effect: NoteEffect;
  readonly stroke?: Stroke;
  readonly pickStroke?: StrokeDirection;
  /** GP4/GP5's rasgueado flag (no pattern). */
  readonly isRasgueado?: boolean;
}

export interface NoteContext {
  readonly string: number;
  /** The beat's effects, copied into the note. */
  readonly effect: NoteEffect;
  /** Fret of the previous note on this string, for tied notes (-1 if none). */
  readonly tiedFret: () => number;
}

/** Reads the string bitmask (bit 6 = string 1) and one note per set bit the track has a string for. */
export function readStringNotes(
  reader: ByteReader,
  stringCount: number,
  readNote: (string: number) => Note,
): readonly Note[] {
  const stringFlags = reader.readUnsignedByte();
  const notes: Note[] = [];
  for (let i = 6; i >= 0; i--) {
    if ((stringFlags & (1 << i)) !== 0 && 6 - i < stringCount) {
      notes.push(readNote(7 - i));
    }
  }
  return notes;
}

/** Fret of the latest earlier note on `string`, searched like TuxGuitar's getTiedNoteValue; -1 if none. */
export function findTiedFret(previous: readonly Measure[], current: readonly Beat[], string: number): number {
  const found = searchTiedFret(current, string);
  if (found !== undefined) {
    return found;
  }
  for (let m = previous.length - 1; m >= 0; m--) {
    const fret = searchTiedFret(previous[m]?.beats ?? [], string);
    if (fret !== undefined) {
      return fret;
    }
  }
  return -1;
}

function searchTiedFret(beats: readonly Beat[], string: number): number | undefined {
  for (let b = beats.length - 1; b >= 0; b--) {
    for (const voice of beats[b]?.voices ?? []) {
      const note = voice.isEmpty ? undefined : voice.notes.find((candidate) => candidate.string === string);
      if (note !== undefined) {
        return note.fret;
      }
    }
  }
  return undefined;
}

/** A note's fingering (note flag 0x80): the left-hand finger, then the right-hand one, each 0 thumb … 4 little, -1 none. */
export function readFingers(reader: ByteReader): Pick<Note, 'leftFinger' | 'rightFinger'> {
  const leftFinger = fingerFromGp(reader.readByte());
  const rightFinger = fingerFromGp(reader.readByte());
  return { ...(leftFinger === undefined ? {} : { leftFinger }), ...(rightFinger === undefined ? {} : { rightFinger }) };
}

/** Note fret: tied notes repeat the previous fret; anything outside 0…99 becomes 0. */
export function resolveFret(raw: number, isTied: boolean, tiedFret: () => number): number {
  const value = isTied ? tiedFret() : raw;
  return value >= 0 && value < MAX_TIED_FRET ? value : 0;
}

/**
 * A chord with a fret per track string (-1 = not played). TuxGuitar drops chords without any played
 * string; we also keep chords that only have a name (GP3/GP4 "simple" chords without a diagram).
 */
export function buildChord(name: string, firstFret: number, frets: readonly number[], stringCount: number): Chord | undefined {
  const strings = Array.from({ length: Math.max(0, stringCount) }, (_, index) => frets[index] ?? -1);
  const isUsed = name.length > 0 || strings.some((fret) => fret >= 0);
  return isUsed ? { name, firstFret, frets: strings } : undefined;
}

/** GP3/GP4 chord without diagram details: name, first fret and (if the first fret is set) six frets. */
export function readSimpleChord(reader: ByteReader, stringCount: number): Chord | undefined {
  const name = reader.readStringByteSizeOfInteger();
  const firstFret = reader.readInt();
  const frets = firstFret !== 0 ? readInts(reader, 6) : [];
  return buildChord(name, firstFret, frets, stringCount);
}

/** Stroke speed byte to a note value (TuxGuitar's toStrokeValue). */
function strokeValue(value: number): number {
  const values: Readonly<Record<number, number>> = { 3: 32, 4: 16, 5: 8, 6: 4 };
  return values[value] ?? 64;
}

/** Two stroke bytes; GP3/GP4 store "down" first, GP5 "up" first. The first one set wins. */
export function readStroke(reader: ByteReader, first: 'up' | 'down'): Stroke | undefined {
  const firstValue = reader.readByte();
  const secondValue = reader.readByte();
  if (firstValue > 0) {
    return { direction: first, value: strokeValue(firstValue) };
  }
  if (secondValue > 0) {
    return { direction: first === 'down' ? 'up' : 'down', value: strokeValue(secondValue) };
  }
  return undefined;
}

export function readPickStroke(reader: ByteReader): StrokeDirection | undefined {
  const direction = reader.readByte();
  if ((direction & 0x01) !== 0) {
    return 'up';
  }
  return (direction & 0x02) !== 0 ? 'down' : undefined;
}

// ---------------------------------------------------------------- mix-table changes

/** Volume, pan, chorus, reverb, phaser and tremolo. */
const MIX_TABLE_VALUE_COUNT = 6;

/** GP3–GP5 mix-table values, one signed byte each (negative = unchanged). */
export function readMixTableValues(reader: ByteReader): readonly number[] {
  return Array.from({ length: MIX_TABLE_VALUE_COUNT }, () => reader.readByte());
}

/** Skips the transition-duration byte that follows the tempo for each changed (≥ 0) mix-table value. */
export function skipMixTransitions(reader: ByteReader, values: readonly number[]): void {
  values.forEach((value) => {
    if (value >= 0) {
      reader.readByte();
    }
  });
}

// ---------------------------------------------------------------- note effects

/** GP4/GP5 bend and tremolo bar: type and value (skipped), then the points. */
export function readBendPoints(reader: ByteReader, toValue: (raw: number) => number): readonly BendPoint[] {
  reader.skip(5);
  const count = reader.readInt();
  const points: BendPoint[] = [];
  for (let i = 0; i < count; i++) {
    const position = reader.readInt();
    const value = reader.readInt();
    reader.readByte(); // vibrato
    points.push({ position: bendPositionFromGp(position, GP_BEND_POSITION), value: toValue(value) });
  }
  return points;
}

export function withBend(effect: NoteEffect, points: readonly BendPoint[]): NoteEffect {
  return points.length > 0 ? { ...effect, bend: { points } } : effect;
}

export function withTremoloBar(effect: NoteEffect, points: readonly BendPoint[]): NoteEffect {
  return points.length > 0 ? { ...effect, tremoloBar: { points } } : effect;
}

export function readTremoloPicking(reader: ByteReader): TremoloPicking | undefined {
  const values: Readonly<Record<number, Duration['value']>> = { 1: 8, 2: 16, 3: 32 };
  const value = values[reader.readUnsignedByte()];
  return value === undefined ? undefined : { duration: plainDuration(value) };
}

export function readTrill(reader: ByteReader): Trill | undefined {
  const fret = reader.readByte();
  const values: Readonly<Record<number, Duration['value']>> = { 1: 16, 2: 32, 3: 64 };
  const value = values[reader.readByte()];
  return value === undefined ? undefined : { fret, duration: plainDuration(value) };
}

export function withTremoloPicking(effect: NoteEffect, tremoloPicking: TremoloPicking | undefined): NoteEffect {
  return tremoloPicking === undefined ? effect : { ...effect, tremoloPicking };
}

export function withTrill(effect: NoteEffect, trill: Trill | undefined): NoteEffect {
  return trill === undefined ? effect : { ...effect, trill };
}

export function withHarmonic(effect: NoteEffect, harmonic: NoteEffect['harmonic']): NoteEffect {
  return harmonic === undefined ? effect : { ...effect, harmonic };
}

export const GRACE_TRANSITIONS: readonly NonNullable<NoteEffect['grace']>['transition'][] = [
  'none',
  'slide',
  'bend',
  'hammer',
];

// ---------------------------------------------------------------- measures and song

/** What a format reader needs to read one track's measure. */
export interface MeasureJob {
  /** Start of the measure in ticks. */
  readonly start: number;
  /** Tempo in effect when the measure starts (mix-table changes update it). */
  readonly tempo: number;
  readonly track: TrackRead;
  /** Measures of this track read so far, beats in reading order (for tied notes). */
  readonly previous: readonly Measure[];
}

export interface MeasureBeats {
  readonly beats: readonly Beat[];
  /** Tempo in effect after the measure. */
  readonly tempo: number;
}

/** Everything read before the measures. */
export interface SongParts {
  readonly source: SourceInfo;
  readonly info: SongInfo;
  readonly registry: ChannelRegistry;
  readonly headers: readonly HeaderDraft[];
  /** Key signature per measure (carried over from the previous measure). */
  readonly keySignatures: readonly number[];
  readonly tracks: readonly TrackRead[];
  /** Song tempo from the file header. */
  readonly tempo: number;
}

/**
 * Reads the measures (all tracks of measure 1, then of measure 2 …) the way TuxGuitar's readMeasures
 * does: measure 1 starts at QUARTER_TIME, each header takes the tempo in effect after its measure.
 */
export function readSongMeasures(parts: SongParts, readBeats: (job: MeasureJob) => MeasureBeats): Song {
  const measures: Measure[][] = parts.tracks.map(() => []);
  const headers: MeasureHeader[] = [];
  let start = QUARTER_TIME;
  let tempo = parts.tempo;
  parts.headers.forEach((header, index) => {
    parts.tracks.forEach((track, trackIndex) => {
      const previous = measures[trackIndex] ?? [];
      const context = `measure ${index + 1}, track ${trackIndex + 1}`;
      const result = withContext(context, () => readBeats({ start, tempo, track, previous }));
      tempo = result.tempo;
      const keySignature = parts.keySignatures[index] ?? 0;
      previous.push({ headerIndex: index, clef: track.clef, keySignature, beats: result.beats });
    });
    headers.push({ ...header, start, tempo });
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  });
  return assembleSong(parts, headers, measures);
}

function assembleSong(parts: SongParts, headers: readonly MeasureHeader[], measures: readonly Measure[][]): Song {
  const tracks = parts.tracks.map((track, index) => ({
    ...track.draft,
    measures: (measures[index] ?? []).map(sortBeats),
  }));
  const song: Song = {
    source: parts.source,
    info: parts.info,
    channels: parts.registry.channels,
    measureHeaders: headers,
    tracks,
  };
  return normalizeSong(song, parts.registry.gmChannels);
}

/** GP5 voices can add beats out of order; TuxGuitar sorts them by start (stable) before use. */
function sortBeats(measure: Measure): Measure {
  return { ...measure, beats: [...measure.beats].sort((a, b) => a.start - b.start) };
}
