import { createChannelName } from '../../src/formats/common/channels';
import { DEFAULT_VELOCITY } from '../../src/formats/common/velocity';
import { EMPTY_VOICE } from '../../src/formats/gtp/shared';
import {
  DEFAULT_CHANNEL,
  DEFAULT_PERCUSSION_BANK,
  durationTicks,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  measureTicks,
  NO_STROKE,
  QUARTER,
  STANDARD_TUNING,
} from '../../src/model/defaults';
import {
  type Beat,
  type Channel,
  type Clef,
  type Duration,
  type MeasureHeader,
  type Note,
  type NoteEffect,
  QUARTER_TIME,
  type Song,
  type SongInfo,
  type Track,
  type Voice,
} from '../../src/model/song';

/*
 * Small songs for writer tests, shaped as the GP5 reader returns them (two voices per beat, channels
 * named after their program, one channel per track), so a round trip can be compared field by field.
 */

export type NoteSpec = Partial<Omit<Note, 'effect'>> & { readonly effect?: Partial<NoteEffect> };

export function buildNote(string: number, fret: number, spec: NoteSpec = {}): Note {
  const { effect, ...rest } = spec;
  return { fret, velocity: DEFAULT_VELOCITY, string, isTied: false, ...rest, effect: { ...EMPTY_NOTE_EFFECT, ...effect } };
}

export function buildVoice(notes: readonly Note[], duration: Duration = QUARTER): Voice {
  return { duration, notes, isEmpty: false, direction: 'none' };
}

export function restVoice(duration: Duration = QUARTER): Voice {
  return buildVoice([], duration);
}

/** A beat of a measure: its first voice, optionally a second one and beat-level extras. */
export interface BeatSpec extends Partial<Omit<Beat, 'start' | 'voices'>> {
  readonly voice: Voice;
  readonly voice2?: Voice;
}

export interface TrackSpec extends Partial<Omit<Track, 'measures' | 'number' | 'channelId'>> {
  /** Beats of each measure; the first voices follow each other from the measure start. */
  readonly measures: readonly (readonly BeatSpec[])[];
  readonly clef?: Clef;
  readonly keySignatures?: readonly number[];
  readonly channel?: Partial<Omit<Channel, 'id' | 'name'>>;
}

export interface SongSpec {
  readonly info?: Partial<SongInfo>;
  readonly headers?: readonly Partial<Omit<MeasureHeader, 'number' | 'start'>>[];
  readonly tracks: readonly TrackSpec[];
}

function buildHeaders(spec: SongSpec): MeasureHeader[] {
  const count = Math.max(spec.headers?.length ?? 0, ...spec.tracks.map((track) => track.measures.length));
  let start = QUARTER_TIME;
  return Array.from({ length: count }, (_, index) => {
    const header: MeasureHeader = {
      number: index + 1,
      start,
      timeSignature: { numerator: 4, denominator: 4 },
      tempo: 120,
      repeatOpen: false,
      repeatClose: 0,
      repeatAlternative: 0,
      tripletFeel: 'none',
      ...spec.headers?.[index],
    };
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
    return header;
  });
}

function buildBeats(specs: readonly BeatSpec[], measureStart: number): Beat[] {
  let start = measureStart;
  return specs.map(({ voice, voice2, ...extras }) => {
    const beat: Beat = { start, voices: [voice, voice2 ?? EMPTY_VOICE], stroke: NO_STROKE, pickStroke: 'none', ...extras };
    start += voice.isEmpty ? 0 : durationTicks(voice.duration);
    return beat;
  });
}

function buildChannels(spec: SongSpec): Channel[] {
  const channels: Channel[] = [];
  spec.tracks.forEach((track, index) => {
    const isPercussion = track.isPercussion ?? false;
    const program = isPercussion ? 0 : (track.channel?.program ?? DEFAULT_CHANNEL.program);
    channels.push({
      ...DEFAULT_CHANNEL,
      balance: 63, // GP stores 17 steps: 64 reads back as 63
      ...track.channel,
      id: index + 1,
      name: createChannelName(channels, program, isPercussion),
      program,
      bank: isPercussion ? DEFAULT_PERCUSSION_BANK : 0,
      isPercussion,
    });
  });
  return channels;
}

function buildTrack(spec: TrackSpec, index: number, headers: readonly MeasureHeader[]): Track {
  const { measures, clef, keySignatures, channel: _channel, ...rest } = spec;
  return {
    name: `Track ${index + 1}`,
    strings: STANDARD_TUNING.map((tuning, i) => ({ number: i + 1, tuning })),
    color: { r: 255, g: 0, b: 0 },
    offset: 0,
    isPercussion: false,
    solo: false,
    mute: false,
    ...rest,
    number: index + 1,
    channelId: index + 1,
    measures: headers.map((header, headerIndex) => ({
      headerIndex,
      clef: clef ?? 'treble',
      keySignature: keySignatures?.[headerIndex] ?? 0,
      beats: buildBeats(measures[headerIndex] ?? [], header.start),
    })),
  };
}

export function buildSong(spec: SongSpec): Song {
  const headers = buildHeaders(spec);
  return {
    source: { format: 'gp5', version: 'FICHIER GUITAR PRO v5.10' },
    info: { ...EMPTY_SONG_INFO, ...spec.info },
    channels: buildChannels(spec),
    measureHeaders: headers,
    tracks: spec.tracks.map((track, index) => buildTrack(track, index, headers)),
  };
}

/** One track, one measure, one beat per note list (quarter notes). */
export function songWithNotes(...beats: readonly (readonly Note[])[]): Song {
  return buildSong({ tracks: [{ measures: [beats.map((notes) => ({ voice: buildVoice(notes) }))] }] });
}
