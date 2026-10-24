// Song → Standard MIDI File + timeline: TuxGuitar's MidiSongWriter flow (LGPL-2.1) with playback options.
import { type SyncMap, buildSyncMap } from '../audio-track/sync-map';
import { measureTicks } from '../model/defaults';
import { QUARTER_TIME, type Song } from '../model/song';
import { type AudioRun, audioRunsOf, syncToAudio } from './audio-sync';
import { buildConductorEvents, buildTrackEvents } from './build-sequence';
import { buildChannelRoutes } from './channel-routes';
import type { SequenceEvent } from './midi-events';
import { writeMidiFile } from './midi-file';
import { toMidiMessages } from './midi-messages';
import { type MidiOptions, SINGLE_PASS, validateOptions } from './midi-options';
import { MIDI_PPQ, fromMidiTicks, toMidiTick } from './midi-ticks';
import { CLICK_ROUTES, type CountIn, buildCountInEvents, buildMetronomeEvents, resolveCountIn } from './metronome';
import { buildPlaybackOrder, type PlayedMeasure } from './playback-order';
import { buildPasses, buildRangeOrder } from './practice-loop';
import { buildTimeline, secondsFromTicks, type TimelineEntry } from './timeline';

export type { MidiOptions } from './midi-options';

export interface MidiRender {
  /**
   * Standard MIDI File, format 1, MIDI_PPQ (960) ticks per quarter: a conductor track, one track per song track, then
   * the metronome's and the count-in's tracks when asked for.
   */
  readonly bytes: Uint8Array;
  /** One entry per played measure, in playback order (repeats expanded), pass after pass. */
  readonly timeline: readonly TimelineEntry[];
  readonly durationSeconds: number;
  /** Index of the metronome's track among the file's tracks (MidiOptions.metronome), so a player can mute it live. */
  readonly metronomeTrackIndex?: number;
  /** Index of the count-in's track among the file's tracks (MidiOptions.countIn): the last one. */
  readonly countInTrackIndex?: number;
  /** Seconds the count-in lasts before the first played measure (0 without one); the timeline starts after it. */
  readonly countInSeconds: number;
  /** With `syncToAudioTrack` and an audio track: the stretches of the audio to play under the render, in order. */
  readonly audioRuns?: readonly AudioRun[];
}

/**
 * MidiSequenceParser.parse: muted tracks are silent; when any track is solo only solo tracks play. A solo audio track
 * counts when playback follows it.
 */
function resolvePlayedTracks(song: Song, trackIndexes: readonly number[] | undefined, isAudioSynced: boolean): ReadonlySet<number> {
  if (trackIndexes !== undefined) {
    return new Set(trackIndexes);
  }
  const hasSolo = song.tracks.some((track) => track.solo) || (isAudioSynced && song.audioTrack?.solo === true);
  return new Set(song.tracks.flatMap((track, index) => (!track.mute && (!hasSolo || track.solo) ? [index] : [])));
}

/** Sequence tick of the first played measure; it becomes MIDI tick 0 (TuxGuitar's ADD_FIRST_TICK_MOVE). */
function playbackOrigin(song: Song, played: readonly PlayedMeasure[], fromHeaderIndex: number): number {
  const first = played[0];
  const header = song.measureHeaders[first?.headerIndex ?? fromHeaderIndex];
  return (header?.start ?? QUARTER_TIME) + (first?.move ?? 0);
}

/** The measures to play once per pass: a range in written order, or the song from a measure with its repeats. */
function resolvePlaybackOrder(
  song: Song,
  fromHeaderIndex: number,
  toHeaderIndex: number | undefined,
): readonly PlayedMeasure[] {
  return toHeaderIndex === undefined
    ? buildPlaybackOrder(song.measureHeaders, fromHeaderIndex)
    : buildRangeOrder(fromHeaderIndex, toHeaderIndex);
}

/** The song with every measure at `fixedTempo` (MidiOptions.fixedTempo), or the song itself. */
function withFixedTempo(song: Song, fixedTempo: number | undefined): Song {
  if (fixedTempo === undefined) {
    return song;
  }
  return { ...song, measureHeaders: song.measureHeaders.map((header) => ({ ...header, tempo: fixedTempo })) };
}

/** The clicks' tracks: the metronome's, then the count-in's (each when asked for). */
function clickTracks(song: Song, played: readonly PlayedMeasure[], origin: number, options: MidiOptions, countIn: CountIn | undefined): SequenceEvent[][] {
  const metronome = options.metronome === undefined ? [] : [buildMetronomeEvents(song.measureHeaders, played, origin, options.metronome)];
  const counting = countIn === undefined || options.countIn === undefined ? [] : [buildCountInEvents(countIn, origin, options.countIn)];
  return [...metronome, ...counting];
}

/** Where the click tracks are among the file's tracks: after the conductor and the song's tracks, metronome first. */
function clickTrackIndexes(songTracks: number, options: MidiOptions, countIn: CountIn | undefined): Pick<MidiRender, 'metronomeTrackIndex' | 'countInTrackIndex'> {
  const metronomeTrackIndex = options.metronome === undefined ? undefined : 1 + songTracks;
  const countInTrackIndex = countIn === undefined || options.countIn === undefined ? undefined : 1 + songTracks + (metronomeTrackIndex === undefined ? 0 : 1);
  return {
    ...(metronomeTrackIndex === undefined ? {} : { metronomeTrackIndex }),
    ...(countInTrackIndex === undefined ? {} : { countInTrackIndex }),
  };
}

/** Turns a song into a MIDI file and a timeline mapping playback time back to measures. */
export function renderMidi(written: Song, options: MidiOptions = {}): MidiRender {
  validateOptions(written, options);
  const song = withFixedTempo(written, options.fixedTempo);
  const fromHeaderIndex = options.fromHeaderIndex ?? 0;
  const syncMap = options.syncToAudioTrack === true && song.audioTrack !== undefined ? buildSyncMap(song) : undefined;
  const playedTracks = resolvePlayedTracks(song, options.trackIndexes, syncMap !== undefined);
  const order = resolvePlaybackOrder(song, fromHeaderIndex, options.toHeaderIndex);
  const synced = followAudio(song, buildPasses(song.measureHeaders, order, options.passTempoScales ?? SINGLE_PASS), syncMap);
  const { played } = synced;
  const countIn = options.countIn === undefined ? undefined : resolveCountIn(song.measureHeaders, played);
  const origin = playbackOrigin(song, played, fromHeaderIndex) - (countIn?.ticks ?? 0);
  const routes = buildChannelRoutes(song.channels);
  const conductor = buildConductorEvents(song, played, origin);
  const tracks = song.tracks.map((track, index) => {
    const channel = song.channels.find((candidate) => candidate.id === track.channelId);
    return buildTrackEvents({ track, headers: song.measureHeaders, played, origin }, channel, playedTracks.has(index));
  });
  const messages = [
    ...[conductor, ...tracks].map((events) => toMidiMessages(events, routes, origin)),
    ...clickTracks(song, played, origin, options, countIn).map((events) => toMidiMessages(events, CLICK_ROUTES, origin)),
  ];
  const countInSeconds = countIn?.seconds ?? 0;
  const timeline = buildTimeline(song.measureHeaders, played, countInSeconds);
  const measuresEnd = toMidiTick(playbackEnd(song, played, origin));
  const lastEvent = messages.reduce(
    (tick, track) => track.reduce((latest, message) => Math.max(latest, message.tick), tick),
    0,
  );
  const tail = fromMidiTicks(Math.max(0, lastEvent - measuresEnd));
  return {
    bytes: writeMidiFile(messages, MIDI_PPQ, measuresEnd),
    timeline: timeline.entries,
    durationSeconds: timeline.endSeconds + secondsFromTicks(tail, timeline.lastTempo),
    ...clickTrackIndexes(song.tracks.length, options, countIn),
    countInSeconds,
    ...(syncMap === undefined ? {} : { audioRuns: audioRunsOf(synced, timeline.entries, syncMap) }),
  };
}

/** The played measures at the audio track's pace when following it, else as they are. */
function followAudio(song: Song, played: readonly PlayedMeasure[], syncMap: SyncMap | undefined): ReturnType<typeof syncToAudio> {
  return syncMap === undefined ? { played, bars: [] } : syncToAudio(song.measureHeaders, played, syncMap);
}

/** Sequence tick (from the origin) where the last played measure ends. */
function playbackEnd(song: Song, played: readonly PlayedMeasure[], origin: number): number {
  const last = played[played.length - 1];
  const header = last === undefined ? undefined : song.measureHeaders[last.headerIndex];
  if (last === undefined || header === undefined) {
    return 0;
  }
  const { numerator, denominator } = header.timeSignature;
  return header.start + last.move + measureTicks(numerator, denominator) - origin;
}
