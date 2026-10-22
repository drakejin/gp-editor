import {
  type Channel,
  type Duration,
  type Measure,
  type MeasureHeader,
  type NoteEffect,
  type NoteValue,
  QUARTER_TIME,
  type Rgb,
  type SongInfo,
  type Stroke,
  type Tuplet,
  type VibratoKind,
} from './song';

export const NORMAL_TUPLET: Tuplet = { enters: 1, times: 1 };

/** "n notes in the time of …" for every tuplet Guitar Pro stores (TGDivisionType.DIVISION_TYPES but GP5's 13:8), by n. */
const TUPLET_TIMES: ReadonlyMap<number, number> = new Map([
  [3, 2],
  [5, 4],
  [6, 4],
  [7, 4],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
]);

/** Notes per tuplet for every tuplet Guitar Pro stores (see tupletOf), smallest first. */
export const TUPLET_SIZES: readonly number[] = [...TUPLET_TIMES.keys()];

/** The tuplet of `enters` notes Guitar Pro stores (3:2, 5:4 … 12:8); NORMAL_TUPLET for 1; undefined for another size. */
export function tupletOf(enters: number): Tuplet | undefined {
  if (enters === NORMAL_TUPLET.enters) {
    return NORMAL_TUPLET;
  }
  const times = TUPLET_TIMES.get(enters);
  return times === undefined ? undefined : { enters, times };
}

export const QUARTER: Duration = {
  value: 4,
  dotted: false,
  doubleDotted: false,
  tuplet: NORMAL_TUPLET,
};

export const NO_STROKE: Stroke = { direction: 'none', value: 0 };

/** The speeds a stroke may have (Stroke.value), as note values. */
export const STROKE_VALUES: readonly [number, ...number[]] = [4, 8, 16, 32, 64, 128];

export const RED: Rgb = { r: 255, g: 0, b: 0 };

export const EMPTY_NOTE_EFFECT: NoteEffect = {
  slides: [],
  vibrato: false,
  wideVibrato: false,
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

/** The note's vibrato: wide wins should a note (against the model's rule) have both flags. */
export function vibratoOf(effect: NoteEffect): VibratoKind {
  if (effect.wideVibrato) {
    return 'wide';
  }
  return effect.vibrato ? 'slight' : 'none';
}

/** The two vibrato flags of a NoteEffect for one vibrato kind. */
export function toVibratoFlags(kind: VibratoKind): Pick<NoteEffect, 'vibrato' | 'wideVibrato'> {
  return { vibrato: kind === 'slight', wideVibrato: kind === 'wide' };
}

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

/** Standard 4-string bass tuning (E A D G), string 1 (G) first. */
export const STANDARD_BASS_TUNING: readonly number[] = [43, 38, 33, 28];

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

/** True when a voice of the measure runs past its end (an over-full measure; Guitar Pro allows and marks them). */
export function isMeasureOverfull(measure: Measure, header: MeasureHeader): boolean {
  const end = header.start + measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  return measure.beats.some((beat) => beat.voices.some((voice) => !voice.isEmpty && beat.start + durationTicks(voice.duration) > end));
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
