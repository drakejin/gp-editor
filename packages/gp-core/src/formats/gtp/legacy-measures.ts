// Port of TuxGuitar app.tuxguitar.io.gtp.GP1InputStream / GP2InputStream, shared parts (LGPL-2.1): measure headers and each track's beats in them.
import { GpFormatError } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';
import { durationTicks, isNoteValue, measureTicks } from '../../model/defaults';
import { type MeasureHeader, QUARTER_TIME, type TimeSignature } from '../../model/song';
import { parseRepeatAlternative } from './gtp-tracks';
import { type ReadBeat, range, readBeat } from './legacy-beats';
import type { LegacyDialect, SongHeader } from './legacy-shared';
import { withContext } from './shared';

const REPEAT_OPEN = 0x01;
const REPEAT_CLOSE = 0x02;
const REPEAT_ALTERNATIVE = 0x04;
const MAX_BEAT_COUNT = 127;
const TRACK_DATA_PADDING = 9;
const MEASURE_PADDING = 6;

export interface ReadMeasure {
  readonly start: number;
  readonly length: number;
  readonly beats: readonly ReadBeat[];
}

export interface ReadMeasures {
  readonly headers: readonly MeasureHeader[];
  readonly tracks: readonly (readonly ReadMeasure[])[];
}

interface MeasureLayout {
  readonly timeSignature: TimeSignature;
  readonly beatCounts: readonly number[];
  readonly repeatOpen: boolean;
  readonly repeatClose: number;
  readonly alternative?: number;
}

export function readMeasures(reader: ByteReader, dialect: LegacyDialect, song: SongHeader): ReadMeasures {
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
