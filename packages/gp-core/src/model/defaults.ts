import {
  type Channel,
  type Duration,
  type NoteEffect,
  type NoteValue,
  QUARTER_TIME,
  type Rgb,
  type SongInfo,
  type Stroke,
  type Tuplet,
} from './song';

export const NORMAL_TUPLET: Tuplet = { enters: 1, times: 1 };

export const QUARTER: Duration = {
  value: 4,
  dotted: false,
  doubleDotted: false,
  tuplet: NORMAL_TUPLET,
};

export const NO_STROKE: Stroke = { direction: 'none', value: 0 };

export const RED: Rgb = { r: 255, g: 0, b: 0 };

export const EMPTY_NOTE_EFFECT: NoteEffect = {
  slides: [],
  vibrato: false,
  deadNote: false,
  hammer: false,
  ghostNote: false,
  accentuatedNote: false,
  heavyAccentuatedNote: false,
  palmMute: false,
  staccato: false,
  tapping: false,
  slapping: false,
  popping: false,
  fadeIn: false,
  letRing: false,
};

export const EMPTY_SONG_INFO: SongInfo = {
  title: '',
  subtitle: '',
  artist: '',
  album: '',
  words: '',
  music: '',
  copyright: '',
  transcriber: '',
  instructions: '',
  notice: [],
};

export const DEFAULT_PERCUSSION_CHANNEL = 9;
export const DEFAULT_PERCUSSION_BANK = 128;

export const DEFAULT_CHANNEL: Omit<Channel, 'id'> = {
  name: '',
  program: 25,
  bank: 0,
  volume: 127,
  balance: 64,
  chorus: 0,
  reverb: 0,
  phaser: 0,
  tremolo: 0,
  isPercussion: false,
};

/** Standard guitar tuning, string 1 (high E) first. */
export const STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];

/**
 * Length of a duration in ticks (QUARTER_TIME per quarter note). Integer maths as in
 * TuxGuitar's TGDuration.getTime, so positions match TuxGuitar's.
 */
export function durationTicks(duration: Duration): number {
  let ticks = Math.floor((QUARTER_TIME * 4) / duration.value);
  if (duration.dotted) {
    ticks += Math.floor(ticks / 2);
  } else if (duration.doubleDotted) {
    ticks += Math.floor(ticks / 4) * 3;
  }
  return Math.floor((ticks * duration.tuplet.times) / duration.tuplet.enters);
}

/** Length of a measure in ticks for a time signature. */
export function measureTicks(numerator: number, denominator: number): number {
  return Math.round((numerator * QUARTER_TIME * 4) / denominator);
}

/** Every note value, longest (whole) first. */
export const NOTE_VALUES: readonly [NoteValue, ...NoteValue[]] = [1, 2, 4, 8, 16, 32, 64];

export function isNoteValue(value: number): value is NoteValue {
  return (NOTE_VALUES as readonly number[]).includes(value);
}

/** Clamp an arbitrary power-of-two-ish value onto a supported note value. */
export function toNoteValue(value: number): NoteValue {
  if (isNoteValue(value)) {
    return value;
  }
  return value < 1 ? 1 : 64;
}

/** A note value without dots or tuplet. */
export function plainDuration(value: NoteValue): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

/** TGDuration.getShortestDuration: a 64th in a 7:4 tuplet. */
const SHORTEST_DURATION: Duration = { value: 64, dotted: false, doubleDotted: false, tuplet: { enters: 7, times: 4 } };

/**
 * TGDuration.fromTime: the longest plain duration that fits in `ticks`, else the shortest duration.
 * (TuxGuitar first looks `ticks` up in a map keyed by "precise" durations, whose smallest key is
 * 110880; tick lengths never reach it, so that lookup is left out.)
 */
export function durationFromTicks(ticks: number): Duration {
  for (const value of NOTE_VALUES) {
    const duration = plainDuration(value);
    if (ticks >= durationTicks(duration)) {
      return duration;
    }
  }
  return SHORTEST_DURATION;
}
