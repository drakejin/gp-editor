// Port of TuxGuitar app.tuxguitar.io.gtp.GP1InputStream / GP2InputStream, shared parts (LGPL-2.1): the song, its tracks and the beats laid out in their measures.
import { GpFormatError } from '../../errors';
import { ByteReader } from '../../io/byte-reader';
import { DEFAULT_CHANNEL, EMPTY_SONG_INFO, EMPTY_VOICE, NO_STROKE, RED } from '../../model/defaults';
import type { Beat, Channel, GuitarString, Measure, MeasureHeader, Song, SongInfo, Track, TripletFeel, Voice } from '../../model/song';
import { createChannelName } from '../common/channels';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { clefFromTuning } from './gtp-tracks';
import { type ReadBeat, range } from './legacy-beats';
import { TICKS_PER_PRECISE, preciseTime, splitPreciseDuration, wholePreciseLength } from './legacy-duration';
import { type ReadMeasure, type ReadMeasures, readMeasures } from './legacy-measures';
import { normalizeSong } from './normalize';
import { skipVersion } from './shared';

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

const INT_SIZE = 4;
const TRACK_PADDING = 10;
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

export interface SongHeader {
  readonly tempo: number;
  readonly tripletFeel: TripletFeel;
  readonly keySignature: number;
  readonly tunings: readonly (readonly number[])[];
  readonly measureCount: number;
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
  const tunings = range(dialect.trackCount).map((trackIndex) => {
    const count = dialect.hasStringCount ? readStringCount(reader, trackIndex + 1) : 6;
    return range(count).map(() => reader.readInt());
  });
  const measureCount = reader.readInt();
  return { tempo, tripletFeel, keySignature, tunings, measureCount };
}

/**
 * A string count that cannot fit in the rest of the file is rejected before anything is
 * allocated for it (TuxGuitar would just read past the end).
 */
function readStringCount(reader: ByteReader, trackNumber: number): number {
  const count = reader.readInt();
  if (count > reader.remaining / INT_SIZE) {
    throw new GpFormatError(`Track ${trackNumber} has ${count} strings, more than the file can hold`);
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
  const measureStart = header.start / TICKS_PER_PRECISE;
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
    start: preciseStart * TICKS_PER_PRECISE,
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
