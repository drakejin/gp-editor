import {
  type Channel,
  type Duration,
  type Measure,
  type MeasureHeader,
  type NoteEffect,
  type NoteValue,
  type PedalMark,
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

/** The tuplets a duration lies in: `tuplet` and, inside it, `innerTuplet` (Duration's own fields). */
export type DurationTuplets = Pick<Duration, 'tuplet' | 'innerTuplet'>;

/** No tuplet at all. */
export const NO_TUPLETS: DurationTuplets = { tuplet: NORMAL_TUPLET };

/** Same number of notes in the same time. */
export function isSameTuplet(a: Tuplet, b: Tuplet): boolean {
  return a.enters === b.enters && a.times === b.times;
}

/** Same outer and inner tuplet (a missing inner tuplet is the normal 1:1). */
export function hasSameTuplets(a: DurationTuplets, b: DurationTuplets): boolean {
  return isSameTuplet(a.tuplet, b.tuplet) && isSameTuplet(a.innerTuplet ?? NORMAL_TUPLET, b.innerTuplet ?? NORMAL_TUPLET);
}

/** `duration` in `tuplets`: their outer tuplet, and their inner one when they have one. */
export function withTuplets(duration: Omit<Duration, 'tuplet' | 'innerTuplet'>, tuplets: DurationTuplets): Duration {
  const { value, dotted, doubleDotted } = duration;
  const base: Duration = { value, dotted, doubleDotted, tuplet: tuplets.tuplet };
  return tuplets.innerTuplet === undefined ? base : { ...base, innerTuplet: tuplets.innerTuplet };
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

/*
 * Tick resolution. TuxGuitar counts 960 ticks per quarter note, which a 7, 9, 11 or 13-tuplet does not divide: seven
 * 7:4 sixteenths came to 959 ticks, so bars with them never filled. QUARTER_TIME is instead 960 × 135135
 * = 2^6 · 3^4 · 5^2 · 7 · 11 · 13 = 129,729,600:
 * - 2^6 lets a double-dotted 64th (7/64 of a quarter) be whole;
 * - 3, 5, 7, 3^2 (9), 11 and 13 are the odd parts of every tuplet Guitar Pro stores (3:2, 5:4, 6:4, 7:4, 9:8, 10:8,
 *   11:8, 12:8, 13:8), so every note value 1…64, plain, dotted or double dotted, in any of them, is a whole number of
 *   ticks; 3^4 and 5^2 add one level of nesting (GP7/GP8's secondary tuplet) for any pair of those tuplets but a 7, 11
 *   or 13-tuplet inside one of the same size, whose length (like any other ratio a file may hold) is rounded down to
 *   a whole tick.
 * Exact rationals would have changed every position in the code; an integer keeps them plain numbers. Being a
 * multiple of 960, old positions scale exactly, and the MIDI files keep 960 PPQ (midi/midi-ticks.ts). Positions stay
 * exact integers (below 2^53) for 69 million quarter notes, far past any song with its repeats played out.
 */

/** A dot adds half the value, a double dot three quarters: the value times 3/2 or 7/4 (a dot wins over a double dot). */
function dotRatio(duration: Duration): readonly [number, number] {
  if (duration.dotted) {
    return [3, 2];
  }
  return duration.doubleDotted ? [7, 4] : [1, 1];
}

/** Length of a duration in ticks (QUARTER_TIME per quarter note): exact for every duration Guitar Pro writes. */
export function durationTicks(duration: Duration): number {
  const inner = duration.innerTuplet ?? NORMAL_TUPLET;
  const [dotTimes, dotParts] = dotRatio(duration);
  const numerator = QUARTER_TIME * 4 * dotTimes * duration.tuplet.times * inner.times;
  return Math.floor(numerator / (duration.value * dotParts * duration.tuplet.enters * inner.enters));
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

/** Sustain pedal marks by offset; at the same offset a release comes before a press (a pedal change). */
export function comparePedalMarks(a: PedalMark, b: PedalMark): number {
  if (a.offset !== b.offset) {
    return a.offset - b.offset;
  }
  return a.action === b.action ? 0 : a.action === 'up' ? -1 : 1;
}
