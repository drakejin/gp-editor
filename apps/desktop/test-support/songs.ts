import { DEFAULT_CHANNEL, EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NO_STROKE, QUARTER, QUARTER_TIME, RED } from '@gp-editor/core';
import type { Beat, Duration, MeasureHeader, Note, NoteEffect, Song, Track } from '@gp-editor/core';

export interface StringsOptions {
  /** GM program of the track's channel; the song keeps no channel when left out. */
  readonly program?: number;
  /** Capo fret. */
  readonly offset?: number;
  readonly isPercussion?: boolean;
}

/** The song with its first track on other strings (string 1 first), optionally a channel program, capo or drums. */
export function onStrings(song: Song, tuning: readonly number[], options: StringsOptions = {}): Song {
  const [track, ...others] = song.tracks;
  if (track === undefined) {
    return song;
  }
  const strings = tuning.map((open, i) => ({ number: i + 1, tuning: open }));
  const tuned = { ...track, strings, offset: options.offset ?? track.offset, isPercussion: options.isPercussion ?? track.isPercussion };
  const channels = options.program === undefined ? song.channels : [{ ...DEFAULT_CHANNEL, id: track.channelId, program: options.program }];
  return { ...song, channels, tracks: [tuned, ...others] };
}

/** Song ticks of one tick of TuxGuitar's grid (960 per quarter note): tests write positions as TuxGuitar counts them. */
const TUX_TICK = QUARTER_TIME / 960;

/** Song ticks of a position written in TuxGuitar ticks. */
export function fromTux(tuxTicks: number): number {
  return tuxTicks * TUX_TICK;
}

/** A song position in TuxGuitar ticks. */
export function toTux(songTicks: number): number {
  return songTicks / TUX_TICK;
}

export function note(string: number, fret: number, effect: Partial<NoteEffect> = {}): Note {
  return { string, fret, velocity: 95, isTied: false, effect: { ...EMPTY_NOTE_EFFECT, ...effect } };
}

/** A beat at `start` TuxGuitar ticks. */
export function beat(start: number, notes: Note[], duration: Duration = QUARTER): Beat {
  return {
    start: fromTux(start),
    voices: [{ duration, notes, isEmpty: false, direction: 'none' }],
    stroke: NO_STROKE,
    pickStroke: 'none',
  };
}

export function header(number: number, overrides: Partial<MeasureHeader> = {}): MeasureHeader {
  return {
    number,
    start: fromTux(960 + (number - 1) * 3840),
    timeSignature: { numerator: 4, denominator: 4 },
    tempo: 120,
    repeatOpen: false,
    repeatClose: 0,
    repeatAlternative: 0,
    tripletFeel: 'none',
    ...overrides,
  };
}

/** One 6-string track; `measures[i]` are the beats of bar i. */
export function makeSong(measures: Beat[][], headers: MeasureHeader[] = measures.map((_, i) => header(i + 1))): Song {
  return {
    source: { format: 'gp5', version: 'FICHIER GUITAR PRO v5.10' },
    info: { ...EMPTY_SONG_INFO, title: 'Test' },
    channels: [],
    measureHeaders: headers,
    tracks: [
      {
        number: 1,
        name: 'Guitar',
        channelId: 1,
        strings: [64, 59, 55, 50, 45, 40].map((tuning, i) => ({ number: i + 1, tuning })),
        color: RED,
        offset: 0,
        isPercussion: false,
        solo: false,
        mute: false,
        measures: measures.map((beats, headerIndex) => ({ headerIndex, clef: 'treble', keySignature: 0, beats })),
      },
    ],
  };
}

/** The song with one more track after the others: `measures[i]` are its beats of bar i (an empty bar where left out). */
export function withTrack(song: Song, measures: readonly (readonly Beat[])[], overrides: Partial<Track> = {}): Song {
  const template = song.tracks[0];
  if (template === undefined) {
    return song;
  }
  const number = song.tracks.length + 1;
  const track: Track = {
    ...template,
    number,
    name: `Track ${number}`,
    channelId: number,
    measures: song.measureHeaders.map((_, headerIndex) => ({ headerIndex, clef: 'treble', keySignature: 0, beats: measures[headerIndex] ?? [] })),
    ...overrides,
  };
  return { ...song, tracks: [...song.tracks, track] };
}
