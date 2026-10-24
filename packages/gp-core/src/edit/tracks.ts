// Track edits after TuxGuitar's TGSongManager.addTrack / removeTrack / cloneTrack / moveTrackUp / moveTrackDown and
// TGRemoveTrackAction (LGPL-2.1): a new track gets a channel of its own (TGSongManager.addChannel), drums the
// percussion bank, which the MIDI routes put on channel 10 (midi/channel-routes.ts).
import { GM_INSTRUMENT_NAMES, createChannelName } from '../formats/common/channels';
import { PERCUSSION_STRING_COUNT } from '../formats/midi/midi-strings';
import { DEFAULT_CHANNEL, DEFAULT_PERCUSSION_BANK, RED } from '../model/defaults';
import type { Channel, Clef, Song, Track } from '../model/song';
import { restMeasure } from './measures';
import { type TrackKind, type TrackKindSpec, trackKindSpec, trackTuningChoices } from './track-kinds';
import { MAX_CAPO } from './track-properties';

/** What addTrack makes; everything but the kind falls back to the kind's defaults (TRACK_KINDS). */
export interface NewTrack {
  readonly kind: TrackKind;
  /** Trimmed; blank or absent: the kind's name ("other": its General MIDI instrument's). */
  readonly name?: string;
  /** General MIDI program 0–127; drums always play the percussion bank's first kit. */
  readonly program?: number;
  /** Open-string MIDI pitches, string 1 (highest) first; absent: the kind's first tuning. Drums: six strings tuned 0. */
  readonly tuning?: readonly number[];
  /** Capo fret, rounded and kept within 0…MAX_CAPO; drums have none. */
  readonly capo?: number;
}

/** Most strings a new track may have: the 8-string guitar's. */
export const MAX_NEW_TRACK_STRINGS = 8;
/** Highest MIDI program and pitch. */
const MAX_MIDI_VALUE = 127;

interface ResolvedTrack {
  readonly spec: TrackKindSpec;
  readonly name: string;
  readonly program: number;
  readonly tuning: readonly number[];
  readonly capo: number;
}

function isMidiValue(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_MIDI_VALUE;
}

function resolveTuning(spec: TrackKindSpec, tuning: readonly number[] | undefined): readonly number[] | undefined {
  if (spec.kind === 'drums') {
    return Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0);
  }
  if (tuning === undefined) {
    return trackTuningChoices(spec.kind, spec.stringCounts[0] ?? 0)[0]?.tuning;
  }
  return tuning.length > 0 && tuning.length <= MAX_NEW_TRACK_STRINGS && tuning.every(isMidiValue) ? tuning : undefined;
}

/** Drums have no capo; any other kind's is rounded and kept within 0…MAX_CAPO (setTrackCapo's rule). */
function resolveCapo(spec: TrackKindSpec, capo: number | undefined): number {
  return spec.kind === 'drums' || capo === undefined || !Number.isFinite(capo) ? 0 : Math.min(MAX_CAPO, Math.max(0, Math.round(capo)));
}

/** The new track's settings, or undefined when the kind, program or tuning cannot be. */
function resolveNewTrack(newTrack: NewTrack): ResolvedTrack | undefined {
  const spec = trackKindSpec(newTrack.kind);
  const program = spec?.kind === 'drums' ? 0 : (newTrack.program ?? spec?.program);
  const tuning = spec === undefined ? undefined : resolveTuning(spec, newTrack.tuning);
  if (spec === undefined || program === undefined || !isMidiValue(program) || tuning === undefined) {
    return undefined;
  }
  const typed = typeof newTrack.name === 'string' ? newTrack.name.trim() : '';
  const name = typed !== '' ? typed : spec.kind === 'other' ? (GM_INSTRUMENT_NAMES[program] ?? spec.name) : spec.name;
  return { spec, name, program, tuning, capo: resolveCapo(spec, newTrack.capo) };
}

/** TGSongManager.getNextChannelId: one more than the highest channel id. */
function nextChannelId(channels: readonly Channel[]): number {
  return channels.reduce((highest, channel) => Math.max(highest, channel.id), 0) + 1;
}

function newChannel(song: Song, program: number, isPercussion: boolean): Channel {
  return {
    ...DEFAULT_CHANNEL,
    id: nextChannelId(song.channels),
    name: createChannelName(song.channels, program, isPercussion),
    program,
    bank: isPercussion ? DEFAULT_PERCUSSION_BANK : 0,
    isPercussion,
  };
}

function clefOf(kind: TrackKind): Clef {
  return kind === 'bass' ? 'bass' : kind === 'drums' ? 'neutral' : 'treble';
}

/** Every track numbered by its place (Track.number = index + 1), as TGSongManager.orderTracks leaves them. */
function numbered(tracks: readonly Track[]): readonly Track[] {
  return tracks.map((track, index) => (track.number === index + 1 ? track : { ...track, number: index + 1 }));
}

function insertAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function isTrackIndex(song: Song, trackIndex: number): boolean {
  return Number.isInteger(trackIndex) && trackIndex >= 0 && trackIndex < song.tracks.length;
}

/**
 * New song with a track added after the last one (TGSongManager.addTrack): its own channel, its kind's strings, clef and
 * sound unless `newTrack` says otherwise, and a bar of rests (in the first voice, the first track's voice slots and key)
 * under every measure header. Same song for a kind it does not know, a program outside 0–127, a tuning of no strings,
 * more than MAX_NEW_TRACK_STRINGS or pitches outside 0–127, or a song without tracks.
 */
export function addTrack(song: Song, newTrack: NewTrack): Song {
  const resolved = resolveNewTrack(newTrack);
  const model = song.tracks[0];
  if (resolved === undefined || model === undefined) {
    return song;
  }
  const isPercussion = resolved.spec.kind === 'drums';
  const channel = newChannel(song, resolved.program, isPercussion);
  const clef = clefOf(resolved.spec.kind);
  const track: Track = {
    number: song.tracks.length + 1,
    name: resolved.name,
    channelId: channel.id,
    strings: resolved.tuning.map((tuning, index) => ({ number: index + 1, tuning })),
    color: RED,
    offset: resolved.capo,
    isPercussion,
    solo: false,
    mute: false,
    measures: song.measureHeaders.map((header, headerIndex) => ({ ...restMeasure(model, headerIndex, header, headerIndex), clef })),
  };
  return { ...song, channels: [...song.channels, channel], tracks: [...song.tracks, track] };
}

/**
 * New song without the track (TGRemoveTrackAction: never the last one); the tracks after it are numbered again, and its
 * channel goes when no other track plays it. Same song for the only track or a track the song does not have.
 */
export function deleteTrack(song: Song, trackIndex: number): Song {
  const track = song.tracks[trackIndex];
  if (track === undefined || !isTrackIndex(song, trackIndex) || song.tracks.length <= 1) {
    return song;
  }
  const tracks = numbered(song.tracks.filter((_, index) => index !== trackIndex));
  const isChannelPlayed = tracks.some((other) => other.channelId === track.channelId);
  return { ...song, tracks, channels: isChannelPlayed ? song.channels : song.channels.filter((channel) => channel.id !== track.channelId) };
}

/**
 * New song with a copy of the track right after it (TGSongManager.cloneTrack places it last), on a copy of its channel
 * with an id and name of its own, so the two can sound apart: the same strings, capo, notes, lyrics, effects, mute and
 * solo. The tracks after it are numbered again. Same song for a track the song does not have.
 */
export function duplicateTrack(song: Song, trackIndex: number): Song {
  const track = song.tracks[trackIndex];
  if (track === undefined || !isTrackIndex(song, trackIndex)) {
    return song;
  }
  const source = song.channels.find((channel) => channel.id === track.channelId) ?? { ...DEFAULT_CHANNEL, id: 0 };
  const channel: Channel = { ...source, id: nextChannelId(song.channels), name: createChannelName(song.channels, source.program, source.isPercussion) };
  // A list of its own: the measures are immutable and shared, the list tells the copy apart (matchTrackIndexes).
  const copy: Track = { ...track, channelId: channel.id, measures: [...track.measures] };
  return { ...song, channels: [...song.channels, channel], tracks: numbered(insertAt(song.tracks, trackIndex + 1, copy)) };
}

/**
 * New song with the track at `fromIndex` moved to `toIndex` (its index afterwards), every track numbered by its new
 * place (TGSongManager.moveTrackUp / moveTrackDown, by more than one place). Same song for the same place or a place
 * the song does not have.
 */
export function moveTrack(song: Song, fromIndex: number, toIndex: number): Song {
  const track = song.tracks[fromIndex];
  if (track === undefined || !isTrackIndex(song, fromIndex) || !isTrackIndex(song, toIndex) || fromIndex === toIndex) {
    return song;
  }
  const others = song.tracks.filter((_, index) => index !== fromIndex);
  return { ...song, tracks: numbered(insertAt(others, toIndex, track)) };
}

/** True when a track has at least one note (deleting it asks first). */
export function hasTrackNotes(track: Track): boolean {
  return track.measures.some((measure) => measure.beats.some((beat) => beat.voices.some((voice) => voice.notes.length > 0)));
}
