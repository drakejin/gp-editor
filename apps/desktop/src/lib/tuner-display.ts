import { STANDARD_TUNING, type Track, type TunerReading, trackTuning } from '@gp-editor/core';
import { pitchClassName, pitchName, pitchOctave, tuningLabel } from './pitch';
import type { TunerStatus } from './tuner-input';

/** Within this many cents a note shows as in tune (green), as most tuners do. */
export const IN_TUNE_CENTS = 5;
/** The needle's strip spans -50 … +50 cents: half a semitone each way, up to the next note. */
const CENTS_RANGE = 50;
/** How far a note may be from an open string for that string to light: TGTunerFineWidget's FINE_TUNING_RANGE, 1.5 semitones. */
export const STRING_RANGE_CENTS = 150;
/** The input meter's floor; 0 dBFS is full scale. */
const METER_FLOOR_DB = -60;

/** The open strings the tuner compares with, and what they are. */
export interface TunerStrings {
  readonly tuning: readonly number[];
  readonly caption: string;
}

/** A string of the tuning as the panel shows it; the nearest one is lit with its cents. */
export interface StringButton {
  /** 1 = the highest string. */
  readonly number: number;
  readonly label: string;
  readonly isNearest: boolean;
  readonly cents?: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Where the needle stands across the strip, 0 (-50 cents or flatter) … 1 (+50 or sharper). */
export function needleFraction(cents: number): number {
  return clamp((cents + CENTS_RANGE) / (2 * CENTS_RANGE), 0, 1);
}

export function isInTune(cents: number): boolean {
  return Math.abs(cents) <= IN_TUNE_CENTS;
}

/** "+12 ¢", "−8 ¢", "0 ¢". */
export function centsText(cents: number): string {
  const rounded = Math.round(cents);
  return rounded > 0 ? `+${rounded} ¢` : rounded < 0 ? `−${-rounded} ¢` : '0 ¢';
}

export function frequencyText(frequency: number): string {
  return `${frequency.toFixed(1)} Hz`;
}

/** The note's name and octave, shown apart: "A" and 2. */
export function noteParts(note: number): { readonly name: string; readonly octave: number } {
  return { name: pitchClassName(note), octave: pitchOctave(note) };
}

/** How full the input meter is, 0 … 1, for a level in dBFS. */
export function levelFraction(levelDb: number): number {
  return clamp((levelDb - METER_FLOOR_DB) / -METER_FLOOR_DB, 0, 1);
}

/** The shown track's open strings (no capo: the tuner tunes the strings themselves); standard guitar without one. */
export function tunerStrings(track: Track | undefined): TunerStrings {
  if (track === undefined || track.isPercussion || track.strings.length === 0) {
    return { tuning: STANDARD_TUNING, caption: 'Standard guitar tuning' };
  }
  const tuning = trackTuning(track);
  return { tuning, caption: `${track.name.trim() || `Track ${track.number}`} · ${tuningLabel(tuning)}` };
}

/**
 * The strings from the lowest (the highest number) up, the one nearest the reading lit — only within STRING_RANGE_CENTS
 * of it: a note an octave away, or between two strings, is not a string being tuned.
 */
export function stringButtons(tuning: readonly number[], reading: TunerReading | undefined): readonly StringButton[] {
  const nearest = reading?.string !== undefined && Math.abs(reading.string.cents) <= STRING_RANGE_CENTS ? reading.string : undefined;
  return tuning
    .map((note, index) => ({
      number: index + 1,
      label: pitchName(note),
      isNearest: nearest?.index === index,
      cents: nearest?.index === index ? nearest.cents : undefined,
    }))
    .reverse();
}

/** The status line under the tuner. */
export function tunerStatusText(status: TunerStatus, hasTone: boolean): string {
  switch (status.kind) {
    case 'starting':
      return 'Starting the microphone…';
    case 'listening':
      return hasTone ? 'Listening.' : 'Play one string at a time.';
    case 'denied':
      return 'Microphone access is off. Allow GP Editor in System Settings ▸ Privacy & Security ▸ Microphone, then open the tuner again.';
    case 'failed':
      return status.message;
  }
}
