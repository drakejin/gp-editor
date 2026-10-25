// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): measure headers and tracks before their measures are read.
import type { ByteReader } from '../../io/byte-reader';
import { FOUR_FOUR } from '../../model/defaults';
import type { Clef, GuitarString, Lyrics, MeasureHeader, TimeSignature, Track } from '../../model/song';
import { type ChannelRegistry, EMPTY_REGISTRY } from './gtp-channels';
import { readInts, withContext } from './shared';

const STRING_SLOTS = 7;
/** Strings tuned at or below this MIDI pitch get a bass clef (GP3/GP4). */
const BASS_CLEF_TUNING = 34;

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
  let timeSignature: TimeSignature = FOUR_FOUR;
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

/** GP3/GP4 clef: bass when any string is tuned low enough, treble otherwise and for percussion. */
export function clefFromTuning(strings: readonly GuitarString[], isPercussion: boolean): Clef {
  return !isPercussion && strings.some((guitarString) => guitarString.tuning <= BASS_CLEF_TUNING) ? 'bass' : 'treble';
}
