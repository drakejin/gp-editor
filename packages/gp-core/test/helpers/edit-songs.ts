import { expect } from 'vitest';
import { EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NORMAL_TUPLET, NO_STROKE, RED, durationTicks, measureTicks } from '../../src/model/defaults';
import { type Beat, type Duration, type Measure, type MeasureHeader, type Note, type NoteValue, QUARTER_TIME, type Song, type TimeSignature, type Track, type Tuplet, type Voice } from '../../src/model/song';
import { assertSongInvariants } from './invariants';

/** First measure start used by every built song (TuxGuitar starts songs at one quarter). */
export const SONG_START = QUARTER_TIME;

/** voiceLayout's offsets are in 960ths of a quarter (TuxGuitar's ticks), whatever QUARTER_TIME is. */
const LAYOUT_TICKS_PER_QUARTER = 960;

/** One event of a voice: a rest when it has no notes. */
export interface EventSpec {
  readonly duration: Duration;
  readonly notes: readonly Note[];
}

export function dur(value: NoteValue, extra: { readonly dotted?: boolean; readonly tuplet?: Tuplet; readonly innerTuplet?: Tuplet } = {}): Duration {
  const duration: Duration = { value, dotted: extra.dotted ?? false, doubleDotted: false, tuplet: extra.tuplet ?? NORMAL_TUPLET };
  return extra.innerTuplet === undefined ? duration : { ...duration, innerTuplet: extra.innerTuplet };
}

export function n(string: number, fret: number): Note {
  return { string, fret, velocity: 95, isTied: false, effect: EMPTY_NOTE_EFFECT };
}

export function rest(duration: Duration | NoteValue): EventSpec {
  return { duration: typeof duration === 'number' ? dur(duration) : duration, notes: [] };
}

export function play(duration: Duration | NoteValue, ...notes: Note[]): EventSpec {
  return { duration: typeof duration === 'number' ? dur(duration) : duration, notes };
}

const EMPTY_VOICE: Voice = { duration: dur(4), notes: [], isEmpty: true, direction: 'none' };

/** Beats of one measure: each voice's events placed one after the other from `start`, merged by start. */
export function buildBeats(start: number, voices: readonly (readonly EventSpec[])[], voiceCount = 2): Beat[] {
  const slots = new Map<number, Voice[]>();
  voices.forEach((events, voiceIndex) => {
    let position = start;
    for (const event of events) {
      const voicesAt = slots.get(position) ?? Array.from({ length: voiceCount }, () => EMPTY_VOICE);
      voicesAt[voiceIndex] = { duration: event.duration, notes: event.notes, isEmpty: false, direction: 'none' };
      slots.set(position, voicesAt);
      position += durationTicks(event.duration);
    }
  });
  return [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([beatStart, beatVoices]) => ({ start: beatStart, voices: beatVoices, stroke: NO_STROKE, pickStroke: 'none' }));
}

export interface SongSpec {
  /** One per measure; 4/4 when left out. */
  readonly timeSignatures?: readonly TimeSignature[];
  readonly tempos?: readonly number[];
  /** track → measure → voice → events */
  readonly tracks: readonly (readonly (readonly (readonly EventSpec[])[])[])[];
}

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };

export function buildSong(spec: SongSpec): Song {
  const measureCount = spec.tracks[0]?.length ?? 0;
  const headers: MeasureHeader[] = [];
  let start = SONG_START;
  for (let index = 0; index < measureCount; index++) {
    const timeSignature = spec.timeSignatures?.[index] ?? FOUR_FOUR;
    headers.push({
      number: index + 1,
      start,
      timeSignature,
      tempo: spec.tempos?.[index] ?? 120,
      repeatOpen: false,
      repeatClose: 0,
      repeatAlternative: 0,
      tripletFeel: 'none',
    });
    start += measureTicks(timeSignature.numerator, timeSignature.denominator);
  }
  const tracks: Track[] = spec.tracks.map((measures, trackIndex) => ({
    number: trackIndex + 1,
    name: `Track ${trackIndex + 1}`,
    channelId: 0,
    strings: [64, 59, 55, 50, 45, 40].map((tuning, i) => ({ number: i + 1, tuning })),
    color: RED,
    offset: 0,
    isPercussion: false,
    solo: false,
    mute: false,
    measures: measures.map(
      (voices, measureIndex): Measure => ({
        headerIndex: measureIndex,
        clef: 'treble',
        keySignature: 0,
        beats: buildBeats(headers[measureIndex]?.start ?? 0, voices, Math.max(2, voices.length)),
      }),
    ),
  }));
  const channel = { id: 0, name: '', program: 25, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };
  return { source: { format: 'gp5', version: 'test' }, info: EMPTY_SONG_INFO, channels: [channel], measureHeaders: headers, tracks };
}

function durationName(duration: Duration): string {
  const dots = duration.dotted ? '.' : duration.doubleDotted ? '..' : '';
  const tuplet = duration.tuplet.enters === 1 ? '' : `/${duration.tuplet.enters}:${duration.tuplet.times}`;
  const inner = duration.innerTuplet === undefined ? '' : `/${duration.innerTuplet.enters}:${duration.innerTuplet.times}`;
  return `${duration.value}${dots}${tuplet}${inner}`;
}

/**
 * Compact view of one voice of a measure: `offset:duration:content`, offset from the measure start in 960ths of a
 * quarter, content `r` for a rest or `string/fret` pairs. E.g. `['0:4:1/5', '960:2.:r']`.
 */
export function voiceLayout(song: Song, trackIndex: number, measureIndex: number, voiceIndex: number): string[] {
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[trackIndex]?.measures[measureIndex];
  if (header === undefined || measure === undefined) {
    return [];
  }
  return measure.beats.flatMap((beat) => {
    const voice = beat.voices[voiceIndex];
    if (voice === undefined || voice.isEmpty) {
      return [];
    }
    const content = voice.notes.length === 0 ? 'r' : voice.notes.map((note) => `${note.string}/${note.fret}`).join(',');
    const offset = ((beat.start - header.start) * LAYOUT_TICKS_PER_QUARTER) / QUARTER_TIME;
    return [`${offset}:${durationName(voice.duration)}:${content}`];
  });
}

function measureViolations(song: Song, trackIndex: number, measureIndex: number): string[] {
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[trackIndex]?.measures[measureIndex];
  const where = `track ${trackIndex} measure ${measureIndex}`;
  if (header === undefined || measure === undefined) {
    return [`${where}: missing`];
  }
  const problems: string[] = [];
  const voiceEnds: number[] = [];
  let previous = -1;
  measure.beats.forEach((beat, beatIndex) => {
    if (beat.start <= previous || beat.start < header.start) {
      problems.push(`${where} beat ${beatIndex}: start ${beat.start} before ${header.start} or unsorted`);
    }
    previous = beat.start;
    if (beat.voices.every((voice) => voice.isEmpty)) {
      problems.push(`${where} beat ${beatIndex}: no voice holds an event`);
    }
    beat.voices.forEach((voice, voiceIndex) => {
      if (voice.isEmpty) {
        return;
      }
      const expected = voiceEnds[voiceIndex] ?? header.start;
      if (beat.start !== expected) {
        problems.push(`${where} beat ${beatIndex} voice ${voiceIndex}: starts at ${beat.start}, expected ${expected}`);
      }
      voiceEnds[voiceIndex] = expected + durationTicks(voice.duration);
    });
  });
  return problems;
}

/** Edit invariants that go beyond the reader checks: beats sorted from the measure start (an over-full measure runs
 * past its end) and voices laid out back to back. */
export function editInvariantViolations(song: Song): string[] {
  const problems: string[] = [];
  song.tracks.forEach((track, trackIndex) => {
    track.measures.forEach((_measure, measureIndex) => problems.push(...measureViolations(song, trackIndex, measureIndex)));
  });
  return problems;
}

/** Reader invariants plus the edit invariants (see editInvariantViolations). */
export function assertEditInvariants(song: Song): void {
  assertSongInvariants(song);
  expect(editInvariantViolations(song)).toEqual([]);
}

/** Freezes a song and everything in it, so an edit that mutates its input throws. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
