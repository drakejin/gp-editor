// MIDI file ticks: song ticks are finer than a Standard MIDI File's division allows (see QUARTER_TIME in defaults.ts).
import { QUARTER_TIME } from '../model/song';

/** Ticks per quarter note of the MIDI files renderMidi writes: TuxGuitar's 960, a valid SMF division (≤ 0x7FFF). */
export const MIDI_PPQ = 960;

/** Song ticks per MIDI file tick. */
export const MIDI_TICK = QUARTER_TIME / MIDI_PPQ;

/** `midiTicks` MIDI file ticks as song ticks: TuxGuitar's tick constants (vibrato period, slide step …) keep their length. */
export function fromMidiTicks(midiTicks: number): number {
  return midiTicks * MIDI_TICK;
}

/** The MIDI file tick of a song position: each absolute position is rounded on its own, so lengths never drift. */
export function toMidiTick(songTicks: number): number {
  return Math.round(songTicks / MIDI_TICK);
}

/**
 * `numerator / denominator` song ticks cut down to whole MIDI file ticks. TuxGuitar truncates such divisions (bend and
 * slide steps, staccato, fade in) at 960 PPQ; doing it on the same grid renders a song the same as before.
 */
export function truncToMidiTicks(numerator: number, denominator: number): number {
  return Math.trunc(numerator / (denominator * MIDI_TICK)) * MIDI_TICK;
}

/** `numerator / denominator` song ticks rounded to whole MIDI file ticks (TuxGuitar's stroke delay). */
export function roundToMidiTicks(numerator: number, denominator: number): number {
  return Math.round(numerator / (denominator * MIDI_TICK)) * MIDI_TICK;
}
