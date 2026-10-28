// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader (LGPL-2.1): a Standard MIDI File → Song.
import { resolveTrackInstrument } from '../../edit/tuning-presets';
import { GpFormatError } from '../../errors';
import type { Charset } from '../../io/text';
import { DEFAULT_CHANNEL, EMPTY_SONG_INFO, RED } from '../../model/defaults';
import { type Channel, type MeasureHeader, QUARTER_TIME, type Song, type Track } from '../../model/song';
import { GM_INSTRUMENT_NAMES, createChannelName, isGmBassProgram } from '../common/channels';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { buildSongChannels } from './midi-channels';
import { readMidiSequence } from './midi-file-reader';
import { type HeaderTimeline, buildHeaderTimeline } from './midi-headers';
import { type NotePlacer, buildTrackMeasures } from './midi-measures';
import { type MidiTrackEvents, splitFormat0 } from './midi-sequence';
import { type MidiSettings, resolveMidiSettings } from './midi-settings';
import { PERCUSSION_STRING_COUNT, placePercussionNotes, placePitchedNotes, resolveImportTuning } from './midi-strings';
import { type ParsedTracks, type PitchRange, type RawTrack, parseTracks } from './midi-track-parser';

/** Most song tracks an import makes. */
const MAX_IMPORT_TRACKS = 128;
/** Most measures over all tracks (tracks × measures), so a hostile file cannot build a huge song. */
const MAX_TRACK_MEASURES = 1 << 18;
const PERCUSSION_TRACK_NAME = 'Drums';

/** What every track is built with. */
interface SongContext {
  readonly channels: readonly Channel[];
  readonly headers: readonly MeasureHeader[];
  readonly keySignatures: readonly number[];
}

/** The song lasts at least to the measure holding each track's end (its last event, usually end-of-track; TuxGuitar ignores it). */
function extendToTrackEnds(timeline: HeaderTimeline, tracks: readonly MidiTrackEvents[], toTick: (fileTick: number) => number): void {
  for (const events of tracks) {
    const last = events[events.length - 1];
    if (last !== undefined) {
      timeline.indexAt(toTick(last.tick) - 1);
    }
  }
}

/**
 * MidiSongReader.parseTick(tick + resolution): a file tick as a song tick, the song starting a quarter note in.
 * QUARTER_TIME * tick / resolution in exact integer steps (the product would pass 2^53), rounded down as TuxGuitar does.
 */
export function toSongTick(fileTick: number, resolution: number): number {
  const quarters = Math.floor(fileTick / resolution);
  return QUARTER_TIME * (1 + quarters) + Math.floor((QUARTER_TIME * (fileTick - quarters * resolution)) / resolution);
}

/** A track the file does not name: its instrument's General MIDI name, or "Drums". */
function defaultTrackName(channel: Channel | undefined, number: number): string {
  if (channel?.isPercussion === true) {
    return PERCUSSION_TRACK_NAME;
  }
  return GM_INSTRUMENT_NAMES[channel?.program ?? DEFAULT_CHANNEL.program] ?? `Track ${number}`;
}

function buildTrack(raw: RawTrack, index: number, channelId: number, range: PitchRange | undefined, context: SongContext): Track {
  const channel = context.channels.find((candidate) => candidate.id === channelId);
  const isPercussion = channel?.isPercussion ?? false;
  const tuning = isPercussion
    ? Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0)
    : resolveImportTuning(range, isGmBassProgram(channel?.program ?? DEFAULT_CHANNEL.program));
  const draft: Track = {
    number: index + 1,
    name: raw.name ?? defaultTrackName(channel, index + 1),
    channelId,
    strings: tuning.map((open, stringIndex) => ({ number: stringIndex + 1, tuning: open })),
    color: RED,
    offset: 0,
    isPercussion,
    solo: false,
    mute: false,
    measures: [],
  };
  const placeNotes: NotePlacer = isPercussion ? placePercussionNotes : (notes, previous) => placePitchedNotes(notes, tuning, previous);
  const measures = buildTrackMeasures(raw.measures, {
    headers: context.headers,
    keySignatures: isPercussion ? context.keySignatures.map(() => 0) : context.keySignatures,
    clef: resolveTrackInstrument(draft, context.channels) === 'bass' ? 'bass' : 'treble',
    placeNotes,
  });
  return { ...draft, measures };
}

/** checkAll + SongAdjuster: channels, then every track with a measure per header. A track that plays no note gets a default channel. */
function buildSong(format: 0 | 1, parsed: ParsedTracks, timeline: HeaderTimeline): Song {
  const songChannels = buildSongChannels(parsed.tempChannels);
  const hasSilentTrack = parsed.tracks.some((raw) => songChannels.channelIdOf(raw.number) === undefined);
  const fallbackId = songChannels.channels.length + 1;
  const channels: readonly Channel[] = hasSilentTrack
    ? [
        ...songChannels.channels,
        { ...DEFAULT_CHANNEL, id: fallbackId, name: createChannelName(songChannels.channels, DEFAULT_CHANNEL.program, false) },
      ]
    : songChannels.channels;
  const headers = timeline.toMeasureHeaders();
  const context: SongContext = { channels, headers, keySignatures: headers.map((_, index) => timeline.keySignature(index)) };
  const tracks = parsed.tracks.map((raw, index) =>
    buildTrack(raw, index, songChannels.channelIdOf(raw.number) ?? fallbackId, parsed.ranges.get(raw.number), context),
  );
  return {
    source: { format: 'midi', version: `SMF ${format}` },
    info: { ...EMPTY_SONG_INFO, title: parsed.songName },
    channels,
    measureHeaders: headers,
    tracks,
  };
}

/**
 * Reads a Standard MIDI File (format 0 or 1) as TuxGuitar does: one track per MTrk (a format 0 file's channels each get
 * a track), drums on MIDI channel 10 as a percussion track, tempo, meter and key changes as measure headers, note lengths
 * quantised by `options` (MidiSettings' defaults: sixteenths, no tuplets) and tied across bar lines, notes on the strings
 * of a standard guitar or bass tuning when they fit it. Throws GpFormatError for a corrupt file or one without notes.
 */
export function readMidiSong(bytes: Uint8Array, options: Partial<MidiSettings> = {}, charset: Charset = 'auto'): Song {
  const settings = resolveMidiSettings(options);
  const sequence = readMidiSequence(bytes);
  const tracks = splitFormat0(sequence);
  const toTick = (fileTick: number): number => toSongTick(fileTick, sequence.resolution);
  const timeline = buildHeaderTimeline(tracks, toTick);
  const parsed = parseTracks(tracks, { timeline, settings, toTick, charset, maxTracks: MAX_IMPORT_TRACKS });
  if (parsed.ranges.size === 0) {
    throw new GpFormatError('MIDI file holds no notes');
  }
  extendToTrackEnds(timeline, tracks, toTick);
  if (timeline.count * parsed.tracks.length > MAX_TRACK_MEASURES) {
    throw new GpFormatError(`MIDI file is too large: ${parsed.tracks.length} tracks of ${timeline.count} measures`);
  }
  return buildSong(sequence.format, parsed, timeline);
}

/** readSong's MIDI reader: MidiSettings' defaults. */
export function readMidi(bytes: Uint8Array, _detected: DetectedFormat, options: ResolvedReadOptions): Song {
  return readMidiSong(bytes, {}, options.charset);
}
