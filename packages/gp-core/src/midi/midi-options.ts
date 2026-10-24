// renderMidi's playback options and their checks (not in TuxGuitar: practice playback).
import type { Song } from '../model/song';
import type { ClickOptions } from './metronome';

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
   * Quarter notes per minute every measure is played at instead of its own tempo (the song's tempo changes are
   * ignored); each pass's tempo scale still applies. A positive number. Default: the written tempos.
   */
  readonly fixedTempo?: number;
  /** A metronome track after the song's tracks: a click on every beat of every played measure (metronome.ts). */
  readonly metronome?: ClickOptions;
  /** One bar of clicks before the first played measure, in its meter and tempo, on a track of its own (the last). */
  readonly countIn?: ClickOptions;
}

/** Bounds of a pass's tempo scale: a tenth to ten times the written speed. */
const MIN_TEMPO_SCALE = 0.1;
const MAX_TEMPO_SCALE = 10;
/** Most passes one render holds (a caller looping for longer renders the next passes when these end). */
const MAX_PASSES = 64;
const MAX_VELOCITY = 127;
export const SINGLE_PASS: readonly number[] = [1];

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

/** Fixed tempo and click velocities: a positive tempo, whole velocities 1…127. */
function validatePractice(options: MidiOptions): void {
  const { fixedTempo } = options;
  if (fixedTempo !== undefined && !(fixedTempo > 0 && Number.isFinite(fixedTempo))) {
    throw new RangeError(`fixedTempo ${fixedTempo} is not a tempo (a positive number)`);
  }
  for (const [name, clicks] of [['metronome', options.metronome], ['countIn', options.countIn]] as const) {
    const velocity = clicks?.velocity;
    if (velocity !== undefined && !(Number.isInteger(velocity) && velocity >= 1 && velocity <= MAX_VELOCITY)) {
      throw new RangeError(`${name} velocity ${velocity} is not a MIDI velocity (1…${MAX_VELOCITY})`);
    }
  }
}

/** Throws a RangeError for options that do not fit the song or the bounds above. */
export function validateOptions(song: Song, options: MidiOptions): void {
  validateRange(song, options);
  validatePasses(options.passTempoScales ?? SINGLE_PASS);
  validatePractice(options);
  const invalid = options.trackIndexes?.find((index) => !isIndex(index, song.tracks.length));
  if (invalid !== undefined) {
    throw new RangeError(`trackIndexes contains ${invalid}, not a track of this song (0…${song.tracks.length - 1})`);
  }
}
