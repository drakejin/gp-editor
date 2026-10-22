// Song → Standard MIDI File + timeline: TuxGuitar's MidiSongWriter flow (LGPL-2.1) with playback options.
import { measureTicks } from '../model/defaults';
import { QUARTER_TIME, type Song } from '../model/song';
import { buildConductorEvents, buildTrackEvents } from './build-sequence';
import { buildChannelRoutes } from './channel-routes';
import { writeMidiFile } from './midi-file';
import { toMidiMessages } from './midi-messages';
import { buildPlaybackOrder, type PlayedMeasure } from './playback-order';
import { buildTimeline, secondsFromTicks, type TimelineEntry } from './timeline';

export interface MidiOptions {
  /** Tracks to play (0-based). Default: every track, honouring Track.solo / Track.mute like TuxGuitar. */
  readonly trackIndexes?: readonly number[];
  /** Start playback at this measure header (0-based); earlier measures are skipped. Default 0. */
  readonly fromHeaderIndex?: number;
}

export interface MidiRender {
  /** Standard MIDI File, format 1, 960 PPQ: a conductor track, then one track per song track. */
  readonly bytes: Uint8Array;
  /** One entry per played measure, in playback order (repeats expanded). */
  readonly timeline: readonly TimelineEntry[];
  readonly durationSeconds: number;
}

function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}

function validateOptions(song: Song, options: MidiOptions): void {
  const fromHeaderIndex = options.fromHeaderIndex ?? 0;
  if (fromHeaderIndex !== 0 && !isIndex(fromHeaderIndex, song.measureHeaders.length)) {
    throw new RangeError(
      `fromHeaderIndex ${fromHeaderIndex} is not a measure of this song (0…${song.measureHeaders.length - 1})`,
    );
  }
  const invalid = options.trackIndexes?.find((index) => !isIndex(index, song.tracks.length));
  if (invalid !== undefined) {
    throw new RangeError(`trackIndexes contains ${invalid}, not a track of this song (0…${song.tracks.length - 1})`);
  }
}

/** MidiSequenceParser.parse: muted tracks are silent; when any track is solo only solo tracks play. */
function resolvePlayedTracks(song: Song, trackIndexes: readonly number[] | undefined): ReadonlySet<number> {
  if (trackIndexes !== undefined) {
    return new Set(trackIndexes);
  }
  const hasSolo = song.tracks.some((track) => track.solo);
  return new Set(song.tracks.flatMap((track, index) => (!track.mute && (!hasSolo || track.solo) ? [index] : [])));
}

/** Sequence tick of the first played measure; it becomes MIDI tick 0 (TuxGuitar's ADD_FIRST_TICK_MOVE). */
function playbackOrigin(song: Song, played: readonly PlayedMeasure[], fromHeaderIndex: number): number {
  const first = played[0];
  const header = song.measureHeaders[first?.headerIndex ?? fromHeaderIndex];
  return (header?.start ?? QUARTER_TIME) + (first?.move ?? 0);
}

/** Turns a song into a MIDI file and a timeline mapping playback time back to measures. */
export function renderMidi(song: Song, options: MidiOptions = {}): MidiRender {
  validateOptions(song, options);
  const fromHeaderIndex = options.fromHeaderIndex ?? 0;
  const playedTracks = resolvePlayedTracks(song, options.trackIndexes);
  const played = buildPlaybackOrder(song.measureHeaders, fromHeaderIndex);
  const origin = playbackOrigin(song, played, fromHeaderIndex);
  const routes = buildChannelRoutes(song.channels);
  const conductor = buildConductorEvents(song, played, origin);
  const tracks = song.tracks.map((track, index) => {
    const channel = song.channels.find((candidate) => candidate.id === track.channelId);
    return buildTrackEvents({ track, headers: song.measureHeaders, played, origin }, channel, playedTracks.has(index));
  });
  const messages = [conductor, ...tracks].map((events) => toMidiMessages(events, routes, origin));
  const timeline = buildTimeline(song.measureHeaders, played);
  const measuresEnd = playbackEnd(song, played, origin);
  const lastEvent = messages.reduce(
    (tick, track) => track.reduce((latest, message) => Math.max(latest, message.tick), tick),
    0,
  );
  return {
    bytes: writeMidiFile(messages, QUARTER_TIME, measuresEnd),
    timeline: timeline.entries,
    durationSeconds: timeline.endSeconds + secondsFromTicks(Math.max(0, lastEvent - measuresEnd), timeline.lastTempo),
  };
}

/** MIDI tick where the last played measure ends. */
function playbackEnd(song: Song, played: readonly PlayedMeasure[], origin: number): number {
  const last = played[played.length - 1];
  const header = last === undefined ? undefined : song.measureHeaders[last.headerIndex];
  if (last === undefined || header === undefined) {
    return 0;
  }
  const { numerator, denominator } = header.timeSignature;
  return header.start + last.move + measureTicks(numerator, denominator) - origin;
}
