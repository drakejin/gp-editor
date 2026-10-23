import {
  DEFAULT_CHANNEL,
  EMPTY_NOTE_EFFECT,
  EMPTY_SONG_INFO,
  NO_STROKE,
  QUARTER,
  RED,
  STANDARD_TUNING,
  durationTicks,
  measureTicks,
} from '../../src/model/defaults';
import {
  type Beat,
  type Channel,
  type Duration,
  type Hairpin,
  type MeasureHeader,
  type Note,
  type NoteEffect,
  type PedalMark,
  QUARTER_TIME,
  type RasgueadoPattern,
  type Song,
  type Stroke,
  type Track,
  type Voice,
} from '../../src/model/song';

/** Small synthetic songs for MIDI tests: one call per note / beat / track, everything else defaulted. */

export interface NoteSpec {
  readonly fret: number;
  readonly string: number;
  readonly velocity?: number;
  readonly isTied?: boolean;
  readonly effect?: Partial<NoteEffect>;
}

export function note(spec: NoteSpec): Note {
  return {
    fret: spec.fret,
    string: spec.string,
    velocity: spec.velocity ?? 95,
    isTied: spec.isTied ?? false,
    effect: { ...EMPTY_NOTE_EFFECT, ...spec.effect },
  };
}

export interface BeatSpec {
  readonly notes?: readonly Note[];
  readonly duration?: Duration;
  readonly stroke?: Stroke;
  /** Notes of a second voice (same duration unless `secondDuration`). */
  readonly second?: readonly Note[];
  readonly secondDuration?: Duration;
  /** Leave voice 0 empty (no beat in this voice). */
  readonly isEmpty?: boolean;
  readonly hairpin?: Hairpin;
  readonly rasgueado?: RasgueadoPattern;
}

export interface HeaderSpec {
  readonly numerator?: number;
  readonly denominator?: number;
  readonly tempo?: number;
  readonly repeatOpen?: boolean;
  readonly repeatClose?: number;
  readonly repeatAlternative?: number;
  readonly tripletFeel?: MeasureHeader['tripletFeel'];
  readonly directions?: MeasureHeader['directions'];
}

export interface TrackSpec {
  /** Beats per measure; each beat starts where the previous voice-0 beat ended. */
  readonly measures: readonly (readonly BeatSpec[])[];
  readonly name?: string;
  readonly channelId?: number;
  readonly offset?: number;
  readonly tuning?: readonly number[];
  readonly isPercussion?: boolean;
  readonly solo?: boolean;
  readonly mute?: boolean;
  /** Sustain pedal marks of each measure. */
  readonly pedals?: readonly (readonly PedalMark[] | undefined)[];
}

export interface SongSpec {
  readonly headers?: readonly HeaderSpec[];
  readonly tracks: readonly TrackSpec[];
  readonly channels?: readonly Partial<Channel>[];
}

function voice(notes: readonly Note[] | undefined, duration: Duration, isEmpty: boolean): Voice {
  return { duration, notes: notes ?? [], isEmpty, direction: 'none' };
}

function buildBeats(specs: readonly BeatSpec[], measureStart: number): Beat[] {
  let start = measureStart;
  return specs.map((spec) => {
    const duration = spec.duration ?? QUARTER;
    const voices = [voice(spec.notes, duration, spec.isEmpty ?? false)];
    const withSecond =
      spec.second === undefined ? voices : [...voices, voice(spec.second, spec.secondDuration ?? duration, false)];
    const marks = { ...(spec.hairpin === undefined ? {} : { hairpin: spec.hairpin }), ...(spec.rasgueado === undefined ? {} : { rasgueado: spec.rasgueado }) };
    const beat: Beat = { start, voices: withSecond, stroke: spec.stroke ?? NO_STROKE, pickStroke: 'none', ...marks };
    start += durationTicks(duration);
    return beat;
  });
}

function buildHeaders(specs: readonly HeaderSpec[]): MeasureHeader[] {
  let start = QUARTER_TIME;
  return specs.map((spec, index) => {
    const numerator = spec.numerator ?? 4;
    const denominator = spec.denominator ?? 4;
    const header: MeasureHeader = {
      number: index + 1,
      start,
      timeSignature: { numerator, denominator },
      tempo: spec.tempo ?? 120,
      repeatOpen: spec.repeatOpen ?? false,
      repeatClose: spec.repeatClose ?? 0,
      repeatAlternative: spec.repeatAlternative ?? 0,
      tripletFeel: spec.tripletFeel ?? 'none',
      ...(spec.directions === undefined ? {} : { directions: spec.directions }),
    };
    start += measureTicks(numerator, denominator);
    return header;
  });
}

function buildTrack(spec: TrackSpec, index: number, headers: readonly MeasureHeader[]): Track {
  const tuning = spec.tuning ?? STANDARD_TUNING;
  return {
    number: index + 1,
    name: spec.name ?? `Track ${index + 1}`,
    channelId: spec.channelId ?? index + 1,
    strings: tuning.map((value, i) => ({ number: i + 1, tuning: value })),
    color: RED,
    offset: spec.offset ?? 0,
    isPercussion: spec.isPercussion ?? false,
    solo: spec.solo ?? false,
    mute: spec.mute ?? false,
    measures: headers.map((header, headerIndex) => {
      const pedals = spec.pedals?.[headerIndex];
      return {
        headerIndex,
        clef: 'treble',
        keySignature: 0,
        beats: buildBeats(spec.measures[headerIndex] ?? [], header.start),
        ...(pedals === undefined ? {} : { pedals }),
      };
    }),
  };
}

function buildChannel(spec: Partial<Channel> | undefined, id: number, isPercussion: boolean): Channel {
  const percussion = isPercussion ? { program: 0, bank: 128, isPercussion: true } : {};
  return { ...DEFAULT_CHANNEL, id, ...percussion, ...spec };
}

/** A song with one header per HeaderSpec (default: as many 4/4 measures as the longest track). */
export function makeSong(spec: SongSpec): Song {
  const measureCount = Math.max(1, ...spec.tracks.map((track) => track.measures.length));
  const headers = buildHeaders(spec.headers ?? Array.from({ length: measureCount }, () => ({})));
  const tracks = spec.tracks.map((track, index) => buildTrack(track, index, headers));
  const channelIds = [...new Set(tracks.map((track) => track.channelId))];
  const channels =
    spec.channels?.map((channel, index) =>
      buildChannel(channel, channel.id ?? index + 1, channel.isPercussion ?? false),
    ) ??
    channelIds.map((id) =>
      buildChannel(
        undefined,
        id,
        tracks.some((track) => track.channelId === id && track.isPercussion),
      ),
    );
  return {
    source: { format: 'gp5', version: 'test' },
    info: EMPTY_SONG_INFO,
    channels,
    measureHeaders: headers,
    tracks,
  };
}

/** Plain duration helper: `duration(8)` = an eighth, `duration(4, { dotted: true })` … */
export function duration(value: Duration['value'], options: Partial<Omit<Duration, 'value'>> = {}): Duration {
  return { ...QUARTER, value, ...options };
}
