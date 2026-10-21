// Port of TuxGuitar app.tuxguitar.io.gtp.GP1InputStream / GP2InputStream, shared parts (LGPL-2.1).
import { GpFormatError } from '../../errors';
import { ByteReader } from '../../io/byte-reader';
import {
  DEFAULT_CHANNEL,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  NORMAL_TUPLET,
  NO_STROKE,
  RED,
  durationTicks,
  isNoteValue,
  measureTicks,
} from '../../model/defaults';
import {
  type Beat,
  type Bend,
  type Channel,
  type Chord,
  type Duration,
  type GuitarString,
  type Harmonic,
  type Measure,
  type MeasureHeader,
  type Note,
  type NoteEffect,
  QUARTER_TIME,
  type Song,
  type SongInfo,
  type TimeSignature,
  type Track,
  type TripletFeel,
  type Tuplet,
  type Voice,
} from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { normalizeSong } from './normalize';
import {
  artificialHarmonicOffset,
  BEND_MAX_POSITION,
  clefFromTuning,
  createChannelName,
  EMPTY_VOICE,
  parseRepeatAlternative,
  skipVersion,
  withContext,
} from './shared';

/** What differs between the GP1 versions and GP2. */
export interface LegacyDialect {
  readonly format: 'gp1' | 'gp2';
  readonly trackCount: number;
  /** Each track stores its string count (else six strings). */
  readonly hasStringCount: boolean;
  /** Key signature, track name/solo/mixer/capo and a 10-byte block after the tracks. */
  readonly hasTrackDetails: boolean;
  /** Chord diagrams with frets (else only a chord name, which TuxGuitar skips). */
  readonly hasFullChords: boolean;
  /** A grace-note mask after the string and effect masks (3 bytes per grace note). */
  readonly hasGraceFlags: boolean;
  /** Reads what follows the beat flags before the dotted/tuplet byte; returns a tempo change. */
  readonly readBeatPrefix: (reader: ByteReader) => number | undefined;
  /** Reads (or derives) the velocity of a note right after its fret. */
  readonly readVelocity: (reader: ByteReader) => number;
}

/** Channel id and the two GM channels of each of the eight tracks (TRACK_CHANNELS). */
const TRACK_CHANNELS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [2, 2, 3],
  [3, 4, 5],
  [4, 6, 7],
  [5, 8, 10],
  [6, 11, 12],
  [7, 13, 14],
  [8, 9, 9],
];

const BEAT_TEXT = 0x01;
const BEAT_CHORD = 0x02;
const BEAT_EFFECTS = 0x04;
const BEAT_REST = 0x08;
const BEAT_DOTTED = 0x10;
const BEAT_TRIPLET = 0x20;
const BEAT_TIED = 0x40;
const REPEAT_OPEN = 0x01;
const REPEAT_CLOSE = 0x02;
const REPEAT_ALTERNATIVE = 0x04;
const MAX_BEAT_COUNT = 127;
const INT_SIZE = 4;
const DEAD_NOTE_FRET = 100;
const TRACK_PADDING = 10;
const TRACK_DATA_PADDING = 9;
const MEASURE_PADDING = 6;
const CHORD_DIAGRAM_KIND = 12;
const CHORD_DIAGRAM_PADDING = 32;
const CHORD_FRETS = 6;
const TRIPLET: Tuplet = { enters: 3, times: 2 };
const SHIFT_SLIDE = ['shift'] as const;
/** TGEffectBend.SEMITONE_LENGTH. */
const BEND_SEMITONE_LENGTH = 1;
const NATURAL_HARMONIC: Harmonic = { type: 'natural', data: 0 };
/** TuxGuitar stores harmonic data 0, an index into NATURAL_FREQUENCIES. */
const ARTIFICIAL_HARMONIC: Harmonic = { type: 'artificial', data: artificialHarmonicOffset(0) };
/** GM channel 1 of each channel id (TRACK_CHANNELS[i][1]), for the normalizer. */
const GM_CHANNELS: ReadonlyMap<number, number> = new Map(TRACK_CHANNELS.map(([id, gmChannel]) => [id, gmChannel]));

interface TrackSetup {
  readonly name: string;
  readonly program: number;
  readonly solo: boolean;
  readonly volume: number;
  readonly balance: number;
  readonly chorus: number;
  readonly reverb: number;
  readonly offset: number;
}

/** A beat as read, before TuxGuitar's updatePreciseStart / autoCompleteSilences. */
interface ReadBeat {
  readonly start: number;
  readonly duration: Duration;
  readonly notes: readonly Note[];
  readonly chord?: Chord;
  readonly text?: string;
}

interface ReadMeasure {
  readonly start: number;
  readonly length: number;
  readonly beats: readonly ReadBeat[];
}

interface SongHeader {
  readonly tempo: number;
  readonly tripletFeel: TripletFeel;
  readonly keySignature: number;
  readonly tunings: readonly (readonly number[])[];
  readonly measureCount: number;
}

interface ReadMeasures {
  readonly headers: readonly MeasureHeader[];
  readonly tracks: readonly (readonly ReadMeasure[])[];
}

/** Reads a whole GP1/GP2 file (GP1InputStream.readSong / GP2InputStream.readSong). */
export function readLegacySong(
  bytes: Uint8Array,
  detected: DetectedFormat,
  options: ResolvedReadOptions,
  dialect: LegacyDialect,
): Song {
  const reader = new ByteReader(bytes, options.charset);
  skipVersion(reader);
  const info = readInfo(reader);
  const header = readSongHeader(reader, dialect);
  const setups = range(dialect.trackCount).map(() => readTrackSetup(reader, dialect));
  if (dialect.hasTrackDetails) {
    reader.skip(TRACK_PADDING);
  }
  const measures = readMeasures(reader, dialect, header);
  const song: Song = {
    source: { format: dialect.format, version: detected.version },
    info,
    channels: buildChannels(setups),
    measureHeaders: measures.headers,
    tracks: setups.map((setup, i) => buildTrack(i, setup, header, measures)),
  };
  // GTPInputStream.read runs GTPSongNormalizer after every GTP reader.
  return normalizeSong(song, GM_CHANNELS);
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

function readInfo(reader: ByteReader): SongInfo {
  const title = reader.readStringByteSizeOfByte();
  const author = reader.readStringByteSizeOfByte();
  reader.readStringByteSizeOfByte(); // read and dropped by TuxGuitar
  return { ...EMPTY_SONG_INFO, title, words: author, music: author };
}

function readSongHeader(reader: ByteReader, dialect: LegacyDialect): SongHeader {
  const tempo = reader.readInt();
  const tripletFeel: TripletFeel = reader.readInt() === 1 ? 'eighth' : 'none';
  const keySignature = dialect.hasTrackDetails ? reader.readInt() : 0;
  const tunings = range(dialect.trackCount).map((track) => {
    const count = dialect.hasStringCount ? readStringCount(reader, track + 1) : 6;
    return range(count).map(() => reader.readInt());
  });
  const measureCount = reader.readInt();
  return { tempo, tripletFeel, keySignature, tunings, measureCount };
}

/**
 * A string count that cannot fit in the rest of the file is rejected before anything is
 * allocated for it (TuxGuitar would just read past the end).
 */
function readStringCount(reader: ByteReader, track: number): number {
  const count = reader.readInt();
  if (count > reader.remaining / INT_SIZE) {
    throw new GpFormatError(`Track ${track} has ${count} strings, more than the file can hold`);
  }
  return count;
}

/** Java's (short) cast. */
function toShort(value: number): number {
  return (value << 16) >> 16;
}

function readTrackSetup(reader: ByteReader, dialect: LegacyDialect): TrackSetup {
  const program = toShort(reader.readInt());
  const defaults = { name: 'Track 1', program, solo: false, offset: 0 };
  if (!dialect.hasTrackDetails) {
    const { volume, balance, chorus, reverb } = DEFAULT_CHANNEL;
    return { ...defaults, volume, balance, chorus, reverb };
  }
  reader.readInt(); // number of frets
  return {
    ...defaults,
    name: reader.readStringByteSizeOfByte(),
    solo: reader.readBoolean(),
    volume: toShort(reader.readInt()),
    balance: toShort(reader.readInt()),
    chorus: toShort(reader.readInt()),
    reverb: toShort(reader.readInt()),
    offset: reader.readInt(),
  };
}

// ---------------------------------------------------------------- measures

interface MeasureLayout {
  readonly timeSignature: TimeSignature;
  readonly beatCounts: readonly number[];
  readonly repeatOpen: boolean;
  readonly repeatClose: number;
  readonly alternative?: number;
}

function readMeasures(reader: ByteReader, dialect: LegacyDialect, song: SongHeader): ReadMeasures {
  const headers: MeasureHeader[] = [];
  const tracks: ReadMeasure[][] = song.tunings.map(() => []);
  const lastStarts = song.tunings.map(() => 0);
  for (let index = 0; index < song.measureCount; index++) {
    const previous = headers[index - 1];
    const start = previous === undefined ? QUARTER_TIME : previous.start + headerLength(previous);
    const layout = readMeasureLayout(reader, dialect.trackCount, index + 1);
    const length = measureTicks(layout.timeSignature.numerator, layout.timeSignature.denominator);
    // The header's TGTempo is shared by all tracks: the last mix-table tempo read in the
    // measure (track after track) wins, and the next measure starts from it.
    let tempo = previous?.tempo ?? song.tempo;
    tracks.forEach((measures, t) => {
      const context = { start, length, stringCount: song.tunings[t]?.length ?? 0, lastStart: lastStarts[t] ?? 0 };
      const read = withContext(`Measure ${index + 1}, track ${t + 1}`, () =>
        readTrackMeasure(reader, dialect, context, measures, layout.beatCounts[t] ?? 0),
      );
      measures.push(read.measure);
      lastStarts[t] = read.lastStart;
      tempo = read.tempo ?? tempo;
    });
    headers.push({
      number: index + 1,
      start,
      timeSignature: layout.timeSignature,
      tempo,
      repeatOpen: layout.repeatOpen,
      repeatClose: layout.repeatClose,
      repeatAlternative:
        layout.alternative === undefined ? 0 : parseRepeatAlternative(headers, layout.alternative),
      tripletFeel: song.tripletFeel,
    });
  }
  return { headers, tracks };
}

function headerLength(header: MeasureHeader): number {
  return measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
}

function readMeasureLayout(reader: ByteReader, trackCount: number, number: number): MeasureLayout {
  const timeSignature = readTimeSignature(reader, number);
  reader.skip(MEASURE_PADDING);
  const beatCounts = range(trackCount).map(() => {
    reader.readUnsignedByte();
    reader.readUnsignedByte();
    const count = reader.readUnsignedByte();
    reader.skip(TRACK_DATA_PADDING);
    return count > MAX_BEAT_COUNT ? 0 : count;
  });
  reader.skip(2);
  const flags = reader.readUnsignedByte();
  const repeatClose = (flags & REPEAT_CLOSE) !== 0 ? reader.readUnsignedByte() : 0;
  const alternative = (flags & REPEAT_ALTERNATIVE) !== 0 ? reader.readUnsignedByte() : undefined;
  return { timeSignature, beatCounts, repeatOpen: (flags & REPEAT_OPEN) !== 0, repeatClose, alternative };
}

/**
 * TuxGuitar accepts any byte here; values our model cannot represent (and that make
 * TuxGuitar fail later, such as a zero denominator) are rejected.
 */
function readTimeSignature(reader: ByteReader, number: number): TimeSignature {
  const numerator = reader.readUnsignedByte();
  const denominator = reader.readUnsignedByte();
  if (numerator === 0 || !isNoteValue(denominator)) {
    throw new GpFormatError(`Invalid time signature ${numerator}/${denominator} in measure ${number}`);
  }
  return { numerator, denominator };
}

// ---------------------------------------------------------------- beats

interface TrackContext {
  readonly start: number;
  readonly length: number;
  readonly stringCount: number;
  readonly lastStart: number;
}

interface TrackMeasureRead {
  readonly measure: ReadMeasure;
  readonly lastStart: number;
  readonly tempo?: number;
}

function readTrackMeasure(
  reader: ByteReader,
  dialect: LegacyDialect,
  context: TrackContext,
  previous: readonly ReadMeasure[],
  beatCount: number,
): TrackMeasureRead {
  const beats: ReadBeat[] = [];
  const current: ReadMeasure = { start: context.start, length: context.length, beats };
  let start = context.start;
  let lastStart = context.lastStart;
  let tempo: number | undefined;
  for (let i = 0; i < beatCount; i++) {
    const beatStart = start;
    const previousStart = lastStart;
    const findTiedSource = (): ReadBeat | undefined =>
      previousStart < beatStart ? findBeat(current, previous, previousStart) : undefined;
    const read = readBeat(reader, dialect, context.stringCount, beatStart, findTiedSource);
    beats.push(read.beat);
    tempo = read.tempo ?? tempo;
    lastStart = start;
    start += durationTicks(read.beat.duration);
  }
  return { measure: { start: context.start, length: context.length, beats: [...beats] }, lastStart, tempo };
}

/** getBeat(track, measure, start): the current measure first, then earlier ones, newest first. */
function findBeat(current: ReadMeasure, previous: readonly ReadMeasure[], start: number): ReadBeat | undefined {
  const inCurrent = beatAt(current, start);
  if (inCurrent !== undefined) {
    return inCurrent;
  }
  for (let i = previous.length - 1; i >= 0; i--) {
    const measure = previous[i];
    const found = measure === undefined ? undefined : beatAt(measure, start);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function beatAt(measure: ReadMeasure, start: number): ReadBeat | undefined {
  if (start < measure.start || start >= measure.start + measure.length) {
    return undefined;
  }
  return measure.beats.find((beat) => beat.start === start);
}

interface BeatRead {
  readonly beat: ReadBeat;
  readonly tempo?: number;
}

function readBeat(
  reader: ByteReader,
  dialect: LegacyDialect,
  stringCount: number,
  start: number,
  findTiedSource: () => ReadBeat | undefined,
): BeatRead {
  reader.readInt();
  const value = readDurationValue(reader);
  const flags = reader.readUnsignedByte();
  const tempo = dialect.readBeatPrefix(reader);
  const isTriplet = (flags & BEAT_TRIPLET) !== 0;
  if (isTriplet) {
    reader.skip(1);
  }
  const duration: Duration = {
    value,
    dotted: (flags & BEAT_DOTTED) !== 0,
    doubleDotted: false,
    tuplet: isTriplet ? TRIPLET : NORMAL_TUPLET,
  };
  const effect = (flags & BEAT_EFFECTS) !== 0 ? readBeatEffects(reader) : EMPTY_NOTE_EFFECT;
  const chord = (flags & BEAT_CHORD) !== 0 ? readChord(reader, dialect, stringCount) : undefined;
  const text = (flags & BEAT_TEXT) !== 0 ? reader.readStringByte(0) : undefined;
  const notes = readBeatNotes(reader, dialect, { flags, stringCount, effect, findTiedSource });
  const beat: ReadBeat = { start, duration, notes, ...(chord ? { chord } : {}), ...(text !== undefined ? { text } : {}) };
  return tempo === undefined ? { beat } : { beat, tempo };
}

/** 2^(byte + 4) / 4: -2 = whole … 4 = sixty-fourth. */
function readDurationValue(reader: ByteReader): Duration['value'] {
  const position = reader.position;
  const value = Math.trunc(2 ** (reader.readByte() + 4) / 4);
  if (!isNoteValue(value)) {
    throw new GpFormatError(`Unsupported duration value ${value} at byte ${position}`);
  }
  return value;
}

interface NotesContext {
  readonly flags: number;
  readonly stringCount: number;
  readonly effect: NoteEffect;
  /** The beat read just before this one (getBeat(track, measure, lastReadedStart)). */
  readonly findTiedSource: () => ReadBeat | undefined;
}

function readBeatNotes(reader: ByteReader, dialect: LegacyDialect, context: NotesContext): readonly Note[] {
  if ((context.flags & BEAT_TIED) !== 0) {
    return (context.findTiedSource()?.notes ?? []).map((note) => ({
      fret: note.fret,
      velocity: note.velocity,
      string: note.string,
      isTied: true,
      effect: EMPTY_NOTE_EFFECT,
    }));
  }
  if ((context.flags & BEAT_REST) !== 0) {
    return [];
  }
  const stringFlags = reader.readUnsignedByte();
  const effectFlags = reader.readUnsignedByte();
  const graceFlags = dialect.hasGraceFlags ? reader.readUnsignedByte() : 0;
  const notes: Note[] = [];
  for (let bit = 5; bit >= 0; bit--) {
    const mask = 1 << bit;
    if ((stringFlags & mask) !== 0) {
      const note = readNote(reader, dialect, context, (effectFlags & mask) !== 0);
      notes.push({ ...note, string: context.stringCount - bit });
    }
    if ((graceFlags & mask) !== 0) {
      reader.skip(3); // grace note: read and dropped by TuxGuitar
    }
  }
  return notes.filter((note) => note.string >= 1);
}

function readNote(
  reader: ByteReader,
  dialect: LegacyDialect,
  context: NotesContext,
  hasEffects: boolean,
): Omit<Note, 'string'> {
  const fret = reader.readUnsignedByte();
  const velocity = dialect.readVelocity(reader);
  const effect = hasEffects ? readNoteEffects(reader, context.effect) : context.effect;
  const isDead = fret >= DEAD_NOTE_FRET;
  return { fret: isDead ? 0 : fret, velocity, isTied: false, effect: { ...effect, deadNote: isDead } };
}

/**
 * Beat effects apply to every note of the beat. Flags are kept as the file sets them,
 * without TGNoteEffect's clearing of "incompatible" effects.
 */
function readBeatEffects(reader: ByteReader): NoteEffect {
  const code = reader.readUnsignedByte();
  const effect: NoteEffect = {
    ...EMPTY_NOTE_EFFECT,
    vibrato: code === 1 || code === 2,
    fadeIn: code === 4,
    tapping: code === 5,
    slapping: code === 6,
    popping: code === 7,
  };
  if (code === 3) {
    return { ...effect, bend: readBend(reader) };
  }
  if (code === 8 || code === 9) {
    return { ...effect, harmonic: code === 8 ? NATURAL_HARMONIC : ARTIFICIAL_HARMONIC };
  }
  return effect;
}

/**
 * A note's own effect, on top of the beat effects. TuxGuitar mutates one effect object
 * per beat, so a note effect leaks into the following notes of that beat; here it does not.
 */
function readNoteEffects(reader: ByteReader, beatEffect: NoteEffect): NoteEffect {
  const code = reader.readUnsignedByte();
  const effect: NoteEffect = {
    ...beatEffect,
    hammer: code === 1 || code === 2,
    slides: code === 3 || code === 4 ? SHIFT_SLIDE : [],
  };
  return code === 5 || code === 6 ? { ...effect, bend: readBend(reader) } : effect;
}

function readBend(reader: ByteReader): Bend {
  reader.skip(6);
  const value = Math.round(Math.max(reader.readUnsignedByte() / 8 - 26, 1) * BEND_SEMITONE_LENGTH);
  reader.skip(1);
  return {
    points: [
      { position: 0, value: 0 },
      { position: Math.round(BEND_MAX_POSITION / 2), value },
      { position: BEND_MAX_POSITION, value },
    ],
  };
}

function readChord(reader: ByteReader, dialect: LegacyDialect, stringCount: number): Chord | undefined {
  if (!dialect.hasFullChords) {
    reader.readStringByteSizeOfByte(); // chord name only: skipped by TuxGuitar
    return undefined;
  }
  const name = reader.readStringByte(0);
  reader.skip(1);
  if (reader.readInt() < CHORD_DIAGRAM_KIND) {
    reader.skip(CHORD_DIAGRAM_PADDING);
  }
  const firstFret = reader.readInt();
  const written = firstFret !== 0 ? range(CHORD_FRETS).map(() => reader.readInt()) : [];
  const frets = range(stringCount).map((i) => written[i] ?? -1);
  return frets.some((fret) => fret >= 0) ? { name, firstFret, frets } : undefined;
}

// ---------------------------------------------------------------- assembly

function buildChannels(setups: readonly TrackSetup[]): readonly Channel[] {
  return setups.reduce<readonly Channel[]>((channels, setup, i) => {
    const channel: Channel = {
      ...DEFAULT_CHANNEL,
      id: TRACK_CHANNELS[i]?.[0] ?? i + 1,
      // updateChannelNames runs before the normalizer: no channel is percussion yet.
      name: createChannelName(channels, setup.program, false),
      program: setup.program,
      volume: setup.volume,
      balance: setup.balance,
      chorus: setup.chorus,
      reverb: setup.reverb,
    };
    return [...channels, channel];
  }, []);
}

function buildTrack(index: number, setup: TrackSetup, header: SongHeader, read: ReadMeasures): Track {
  const tuning = header.tunings[index] ?? [];
  const strings: readonly GuitarString[] = tuning.map((value, i) => ({ number: i + 1, tuning: value }));
  // getClef runs before the normalizer, when no channel is a percussion channel yet.
  const clef = clefFromTuning(strings, false);
  const measures = (read.tracks[index] ?? []).map((measure, m): Measure => {
    const measureHeader = read.headers[m];
    if (measureHeader === undefined) {
      throw new GpFormatError(`Measure ${m + 1} has no header`);
    }
    return { headerIndex: m, clef, keySignature: header.keySignature, beats: buildBeats(measure, measureHeader) };
  });
  return {
    number: index + 1,
    name: setup.name,
    channelId: TRACK_CHANNELS[index]?.[0] ?? index + 1,
    strings,
    color: RED,
    offset: setup.offset,
    isPercussion: false,
    solo: setup.solo,
    mute: false,
    measures,
  };
}

/**
 * TGSongManager.updatePreciseStart + autoCompleteSilences for one voice: beats are laid
 * end to end from the measure start, and the time left until the measure end is filled
 * with rests, positions in TGDuration's precise units.
 */
function buildBeats(measure: ReadMeasure, header: MeasureHeader): readonly Beat[] {
  const measureStart = header.start * PRECISE_PER_TICK;
  const measureLength = wholePreciseLength(header.timeSignature);
  const placed = measure.beats.reduce<{ readonly beats: readonly Beat[]; readonly end: number }>(
    (acc, beat) => ({
      beats: [...acc.beats, toBeat(beat, acc.end)],
      end: acc.end + preciseTime(beat.duration),
    }),
    { beats: [], end: measureStart },
  );
  const gap = measureStart + measureLength - placed.end;
  return gap > 0 ? [...placed.beats, ...createSilences(placed.end, gap, measureLength)] : placed.beats;
}

function toBeat(read: ReadBeat, preciseStart: number): Beat {
  const voice: Voice = { duration: read.duration, notes: read.notes, isEmpty: false, direction: 'none' };
  return {
    start: Math.floor(preciseStart / PRECISE_PER_TICK),
    voices: [voice, EMPTY_VOICE],
    stroke: NO_STROKE,
    pickStroke: 'none',
    ...(read.chord ? { chord: read.chord } : {}),
    ...(read.text !== undefined ? { text: read.text } : {}),
  };
}

function createSilences(preciseStart: number, preciseLength: number, maxLength: number): readonly Beat[] {
  const durations = splitPreciseDuration(preciseLength, maxLength) ?? [];
  return durations.reduce<{ readonly beats: readonly Beat[]; readonly next: number }>(
    (acc, duration) => ({
      beats: [...acc.beats, toBeat({ start: 0, duration, notes: [] }, acc.next)],
      next: acc.next + preciseTime(duration),
    }),
    { beats: [], next: preciseStart },
  ).beats;
}

// ---------------------------------------------------------------- TGDuration precise time

const DIVISION_TYPES: readonly Tuplet[] = [
  [1, 1],
  [3, 2],
  [5, 4],
  [6, 4],
  [7, 4],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
].map(([enters = 1, times = 1]) => (enters === 1 ? NORMAL_TUPLET : { enters, times }));

const NOTE_VALUES: readonly Duration['value'][] = [1, 2, 4, 8, 16, 32, 64];
const SHORTEST = 64;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** TGDuration.WHOLE_PRECISE_DURATION: lcm of 64 and every tuplet's enters, times 4 (= 11531520). */
const WHOLE_PRECISE = DIVISION_TYPES.reduce((whole, { enters }) => (whole * enters) / gcd(whole, enters), SHORTEST) * 4;

/** Precise units per tick (3003). */
const PRECISE_PER_TICK = WHOLE_PRECISE / (QUARTER_TIME * 4);

/** Tuplets with coprime enters/times, most enters first (TGDuration.divisionTypes). */
const SPLIT_DIVISIONS: readonly Tuplet[] = DIVISION_TYPES.filter(({ enters, times }) => gcd(enters, times) === 1)
  .slice()
  .sort((a, b) => b.enters - a.enters);

/** TGDuration.getPreciseTime. */
function preciseTime(duration: Duration): number {
  const plain = Math.floor(WHOLE_PRECISE / duration.value);
  const dotted = duration.dotted
    ? Math.floor((plain * 3) / 2)
    : duration.doubleDotted
      ? Math.floor((plain * 7) / 4)
      : plain;
  return Math.floor((dotted * duration.tuplet.times) / duration.tuplet.enters);
}

function wholePreciseLength(timeSignature: TimeSignature): number {
  return Math.floor((timeSignature.numerator * WHOLE_PRECISE) / timeSignature.denominator);
}

/** TGDuration.durationMap: first duration for each precise time (plain, then dotted, then double dotted). */
const DURATION_BY_PRECISE_TIME: ReadonlyMap<number, Duration> = new Map(
  DIVISION_TYPES.flatMap((tuplet) =>
    [
      [false, false],
      [true, false],
      [false, true],
    ].flatMap(([dotted = false, doubleDotted = false]) =>
      NOTE_VALUES.map((value): Duration => ({ value, dotted, doubleDotted, tuplet })),
    ),
  )
    .reverse()
    .map((duration) => [preciseTime(duration), duration] as const),
);

/** No dot, dotted (a multiple of 3 halves) and double dotted (a multiple of 7 quarters). */
const SUB_DIVISIONS = [
  { divisor: 1, factor: 1, dotted: false, doubleDotted: false },
  { divisor: 2, factor: 3, dotted: true, doubleDotted: false },
  { divisor: 4, factor: 7, dotted: false, doubleDotted: true },
] as const;

interface SplitPart {
  readonly durations: readonly Duration[];
  readonly handled: number;
}

/**
 * TGDuration.splitPreciseDuration(timeToSplit, max, factory): rest durations that add up
 * to `total`, or undefined when no exact split exists.
 */
function splitPreciseDuration(total: number, maxLength: number): readonly Duration[] | undefined {
  if (total === 0) {
    return [];
  }
  const max = Math.min(maxLength, WHOLE_PRECISE);
  let maxBase = WHOLE_PRECISE;
  while (max < maxBase) {
    maxBase = Math.floor(maxBase / 2);
  }
  let remaining = total;
  const durations: Duration[] = [];
  for (const division of SPLIT_DIVISIONS) {
    if (division.enters !== 1 && remaining % division.enters === 0) {
      continue;
    }
    const part = splitDivision(remaining, division, max, maxBase);
    if (part !== undefined) {
      durations.push(...part.durations);
      remaining -= part.handled;
    }
  }
  return remaining === 0 ? durations : undefined;
}

function splitDivision(total: number, division: Tuplet, max: number, maxBase: number): SplitPart | undefined {
  for (const sub of SUB_DIVISIONS) {
    const base = Math.floor(Math.floor((WHOLE_PRECISE * division.times) / (division.enters * SHORTEST)) / sub.divisor);
    if (base > maxBase) {
      return undefined;
    }
    const toSubtract = amountToSubtract(total, base, division.enters);
    if (toSubtract % base !== 0 || toSubtract > total) {
      continue;
    }
    let count = toSubtract / base;
    let multiple = 1;
    while (count !== 0 && count % 2 === 0 && multiple * 2 * base <= max) {
      multiple *= 2;
      count /= 2;
    }
    if (count % sub.factor === 0) {
      const unit = durationForPreciseTime(multiple * base * sub.divisor);
      const duration: Duration = { ...unit, dotted: sub.dotted, doubleDotted: sub.doubleDotted };
      const durations = range(count / sub.factor).map(() => duration);
      return { durations, handled: durations.length * preciseTime(duration) };
    }
  }
  return undefined;
}

function amountToSubtract(total: number, base: number, enters: number): number {
  const units = total / base;
  const isPowerOfTwo = total % base === 0 && Number.isInteger(Math.log2(units === 0 ? 1 : units));
  if (enters === 1 || isPowerOfTwo) {
    return total;
  }
  let toSubtract = base;
  while ((total - toSubtract) % enters !== 0 && toSubtract <= total) {
    toSubtract += base;
  }
  return toSubtract;
}

/** TGDuration.setPreciseValue, which throws for a precise time no duration has. */
function durationForPreciseTime(time: number): Duration {
  const duration = DURATION_BY_PRECISE_TIME.get(time);
  if (duration === undefined) {
    throw new GpFormatError(`No duration lasts ${time} / ${WHOLE_PRECISE} of a whole note`);
  }
  return duration;
}
