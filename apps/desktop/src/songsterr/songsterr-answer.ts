// Songsterr's search answer, read as untrusted input (an undocumented endpoint, songsterr-urls.ts): a JSON array of
// `{ songId, artistId, artist, title, tracks: [{ instrumentId, instrument, views, name, tuning, … }], … }` as answered on
// 2026-10-30. Only own properties are read, lists and texts are bounded, and anything not of the expected type is left
// out — a song without a positive whole id or a title is dropped; a list with none left is an unexpected answer.
import { capText, cleanText } from './songsterr-text';

export interface SongsterrTrack {
  /** A General MIDI program (0–127), or Songsterr's 1024 for drums; undefined when the answer had none. */
  readonly instrumentId?: number;
  /** Songsterr's name of the instrument ('' when none). */
  readonly instrument: string;
  /** The part's name, e.g. "Kirk Hammett | Lead Guitar" ('' when none). */
  readonly name: string;
  /** How often the part was viewed on Songsterr. */
  readonly views: number;
  /** The open strings' MIDI notes, string 1 (the highest) first; undefined for drums or an odd tuning. */
  readonly tuning?: readonly number[];
}

export interface SongsterrSong {
  readonly songId: number;
  readonly title: string;
  readonly artist: string;
  readonly tracks: readonly SongsterrTrack[];
}

export type SongsterrAnswer = { readonly kind: 'songs'; readonly songs: readonly SongsterrSong[] } | { readonly kind: 'unexpected' };

/** Characters of answer text read at most (a page of 20 songs is ~30 000). */
export const MAX_ANSWER_LENGTH = 2_000_000;
/** Songs read from one answer. */
export const MAX_SONGS = 50;
/** Tracks read from one song. */
export const MAX_TRACKS = 64;
/** Characters of a title, an artist, an instrument or a part's name kept; longer ones end in “…”. */
export const MAX_TEXT_LENGTH = 200;
/** Strings of a tuning (an extended-range or harp guitar has a dozen). */
const MAX_TUNING_STRINGS = 12;
/** Ids beyond int32 are not Songsterr's. */
const MAX_SONG_ID = 2_147_483_647;
/** Program numbers: General MIDI's 0–127, Songsterr's 1024 for drums, nothing beyond. */
const MAX_INSTRUMENT_ID = 2047;
const MAX_MIDI_NOTE = 127;

type RawObject = Readonly<Record<string, unknown>>;

function isRawObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An own property of a JSON object (never one from its prototype). */
function ownValue(object: RawObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

/** A text to show: no control or direction characters, one space between words, cut to MAX_TEXT_LENGTH with “…”. */
function shownText(value: unknown): string {
  // A text far beyond the cap is cut before it is cleaned (each character costs a little).
  return typeof value === 'string' ? capText(cleanText(value.slice(0, MAX_TEXT_LENGTH * 4)), MAX_TEXT_LENGTH, '…') : '';
}

function wholeNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function parseTuning(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TUNING_STRINGS) {
    return undefined;
  }
  const notes = value.map((note: unknown) => wholeNumber(note, 0, MAX_MIDI_NOTE));
  return notes.every((note): note is number => note !== undefined) ? notes : undefined;
}

function parseTrack(raw: unknown): SongsterrTrack | undefined {
  if (!isRawObject(raw)) {
    return undefined;
  }
  const views = ownValue(raw, 'views');
  return {
    instrumentId: wholeNumber(ownValue(raw, 'instrumentId'), 0, MAX_INSTRUMENT_ID),
    instrument: shownText(ownValue(raw, 'instrument')),
    name: shownText(ownValue(raw, 'name')),
    views: typeof views === 'number' && Number.isFinite(views) && views > 0 ? Math.floor(Math.min(views, Number.MAX_SAFE_INTEGER)) : 0,
    tuning: parseTuning(ownValue(raw, 'tuning')),
  };
}

function parseSong(raw: unknown): SongsterrSong | undefined {
  if (!isRawObject(raw)) {
    return undefined;
  }
  const songId = wholeNumber(ownValue(raw, 'songId'), 1, MAX_SONG_ID);
  const title = shownText(ownValue(raw, 'title'));
  if (songId === undefined || title === '') {
    return undefined;
  }
  const tracks = ownValue(raw, 'tracks');
  const parsedTracks = Array.isArray(tracks) ? tracks.slice(0, MAX_TRACKS).map(parseTrack) : [];
  return {
    songId,
    title,
    artist: shownText(ownValue(raw, 'artist')),
    tracks: parsedTracks.filter((track): track is SongsterrTrack => track !== undefined),
  };
}

/** The songs of a parsed answer; an empty list is no songs found, anything else that holds none is unexpected. */
export function parseSongsterrSongs(value: unknown): SongsterrAnswer {
  if (!Array.isArray(value)) {
    return { kind: 'unexpected' };
  }
  const read = value.slice(0, MAX_SONGS).map(parseSong);
  const songs = read.filter((song, index): song is SongsterrSong => song !== undefined && read.findIndex((other) => other?.songId === song.songId) === index);
  return value.length > 0 && songs.length === 0 ? { kind: 'unexpected' } : { kind: 'songs', songs };
}

/** The answer's text: unexpected when it is not JSON or longer than MAX_ANSWER_LENGTH (not even parsed then). */
export function parseSongsterrBody(body: string): SongsterrAnswer {
  if (body.length === 0 || body.length > MAX_ANSWER_LENGTH) {
    return { kind: 'unexpected' };
  }
  try {
    return parseSongsterrSongs(JSON.parse(body) as unknown);
  } catch {
    return { kind: 'unexpected' };
  }
}
