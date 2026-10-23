// Song → Standard MIDI File + timeline: TuxGuitar's MidiSongWriter flow (LGPL-2.1) with playback options.
import { type SyncMap, buildSyncMap } from '../audio-track/sync-map';
import { measureTicks } from '../model/defaults';
import { QUARTER_TIME, type Song } from '../model/song';
import { type AudioRun, audioRunsOf, syncToAudio } from './audio-sync';
import { buildConductorEvents, buildTrackEvents } from './build-sequence';
import { buildChannelRoutes } from './channel-routes';
import { writeMidiFile } from './midi-file';
import { toMidiMessages } from './midi-messages';
import { MIDI_PPQ, fromMidiTicks, toMidiTick } from './midi-ticks';
import { buildPlaybackOrder, type PlayedMeasure } from './playback-order';
import { buildPasses, buildRangeOrder } from './practice-loop';
import { buildTimeline, secondsFromTicks, type TimelineEntry } from './timeline';

export interface MidiOptions {
  /** Tracks to play (0-based). Default: every track, honouring Track.solo / Track.mute like TuxGuitar. */
  readonly trackIndexes?: readonly number[];
  /** Start playback at this measure header (0-based); earlier measures are skipped. Default 0. */
  readonly fromHeaderIndex?: number;
  /**
   * Last measure header to play (0-based, inclusive). When set, fromHeaderIndex…toHeaderIndex play straight through
   * in written order: repeat signs and alternate endings inside the range are ignored (a practice loop). Default: play
   * to the end of the song, repeats expanded.
   */
  readonly toHeaderIndex?: number;
  /**
   * One entry per pass: the played measures are played once per entry, one pass right after the other, with every
   * tempo of the song multiplied by the pass's scale (so tempo changes keep their proportions). Each scale lies in
   * 0.1…10; at most 64 passes. Default [1]: played once, as written.
   */
  readonly passTempoScales?: readonly number[];
  /**
   * When the song has an audio track: the score plays at the pace of its sync points (so the recording plays untouched
   * at full speed, as in Guitar Pro), `audioRuns` says what of the audio to play under the render, and a solo audio
   * track silences the tracks that are not solo. Default false: the written tempos (e.g. a MIDI file export).
   */
  readonly syncToAudioTrack?: boolean;
}

export interface MidiRender {
  /** Standard MIDI File, format 1, MIDI_PPQ (960) ticks per quarter: a conductor track, then one track per song track. */
  readonly bytes: Uint8Array;
  /** One entry per played measure, in playback order (repeats expanded), pass after pass. */
  readonly timeline: readonly TimelineEntry[];
  readonly durationSeconds: number;
  /** With `syncToAudioTrack` and an audio track: the stretches of the audio to play under the render, in order. */
  readonly audioRuns?: readonly AudioRun[];
}

/** Bounds of a pass's tempo scale: a tenth to ten times the written speed. */
const MIN_TEMPO_SCALE = 0.1;
const MAX_TEMPO_SCALE = 10;
/** Most passes one render holds (a caller looping for longer renders the next passes when these end). */
const MAX_PASSES = 64;
const SINGLE_PASS: readonly number[] = [1];

function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}

function validateRange(song: Song, options: MidiOptions): void {
  const fromHeaderIndex = options.fromHeaderIndex ?? 0;
  const last = song.measureHeaders.length - 1;
  if (fromHeaderIndex !== 0 && !isIndex(fromHeaderIndex, song.measureHeaders.length)) {
    throw new RangeError(`fromHeaderIndex ${fromHeaderIndex} is not a measure of this song (0…${last})`);
  }
  const { toHeaderIndex } = options;
  const isRange = toHeaderIndex === undefined || (isIndex(toHeaderIndex, last + 1) && toHeaderIndex >= fromHeaderIndex);
  if (!isRange) {
    throw new RangeError(`toHeaderIndex ${toHeaderIndex} is not a measure of this song (${fromHeaderIndex}…${last})`);
  }
}

function validatePasses(passTempoScales: readonly number[]): void {
  if (passTempoScales.length === 0 || passTempoScales.length > MAX_PASSES) {
    throw new RangeError(`passTempoScales has ${passTempoScales.length} passes (1…${MAX_PASSES})`);
  }
  const invalid = passTempoScales.find((scale) => !(scale >= MIN_TEMPO_SCALE && scale <= MAX_TEMPO_SCALE));
  if (invalid !== undefined) {
    throw new RangeError(
      `passTempoScales contains ${invalid}, not a tempo scale (${MIN_TEMPO_SCALE}…${MAX_TEMPO_SCALE})`,
    );
  }
}

function validateOptions(song: Song, options: MidiOptions): void {
  validateRange(song, options);
  validatePasses(options.passTempoScales ?? SINGLE_PASS);
  const invalid = options.trackIndexes?.find((index) => !isIndex(index, song.tracks.length));
  if (invalid !== undefined) {
    throw new RangeError(`trackIndexes contains ${invalid}, not a track of this song (0…${song.tracks.length - 1})`);
  }
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

/** Turns a song into a MIDI file and a timeline mapping playback time back to measures. */
export function renderMidi(song: Song, options: MidiOptions = {}): MidiRender {
  validateOptions(song, options);
  const fromHeaderIndex = options.fromHeaderIndex ?? 0;
  const syncMap = options.syncToAudioTrack === true && song.audioTrack !== undefined ? buildSyncMap(song) : undefined;
  const playedTracks = resolvePlayedTracks(song, options.trackIndexes, syncMap !== undefined);
  const order = resolvePlaybackOrder(song, fromHeaderIndex, options.toHeaderIndex);
  const synced = followAudio(song, buildPasses(song.measureHeaders, order, options.passTempoScales ?? SINGLE_PASS), syncMap);
  const { played } = synced;
  const origin = playbackOrigin(song, played, fromHeaderIndex);
  const routes = buildChannelRoutes(song.channels);
  const conductor = buildConductorEvents(song, played, origin);
  const tracks = song.tracks.map((track, index) => {
    const channel = song.channels.find((candidate) => candidate.id === track.channelId);
    return buildTrackEvents({ track, headers: song.measureHeaders, played, origin }, channel, playedTracks.has(index));
  });
  const messages = [conductor, ...tracks].map((events) => toMidiMessages(events, routes, origin));
  const timeline = buildTimeline(song.measureHeaders, played);
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
