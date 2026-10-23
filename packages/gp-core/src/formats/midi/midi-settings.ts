// Port of TuxGuitar app.tuxguitar.io.midi.MidiSettings (LGPL-2.1): the MIDI import's options and their defaults.
import type { NoteValue } from '../../model/song';

export interface MidiSettings {
  /** Semitones added to every note, -24…24 (MidiSettingsDialog's range). */
  readonly transpose: number;
  /** Round note lengths to the durations below (true), or take the longest plain duration that fits (false). */
  readonly quantization: boolean;
  /** Shortest duration quantisation writes, as a note value: 4, 8, 16, 32 or 64. */
  readonly maxDurationValue: NoteValue;
  /** Tuplets quantisation may write: 1 = none, 3 = triplets, 5 = quintuplets too (the dialog stops at 5). */
  readonly maxDivision: number;
}

/** MidiSettings.getDefaults: no transposition, quantised to sixteenths without tuplets. */
export const DEFAULT_MIDI_SETTINGS: MidiSettings = {
  transpose: 0,
  quantization: true,
  maxDurationValue: 16,
  maxDivision: 1,
};

const MAX_TRANSPOSE = 24;
const MAX_DURATION_VALUES: readonly NoteValue[] = [4, 8, 16, 32, 64];
const MAX_DIVISIONS: readonly number[] = [1, 3, 5];

/** The defaults with the given options applied; an option outside the dialog's choices throws a RangeError. */
export function resolveMidiSettings(options: Partial<MidiSettings> = {}): MidiSettings {
  const settings = { ...DEFAULT_MIDI_SETTINGS, ...options };
  if (!Number.isInteger(settings.transpose) || Math.abs(settings.transpose) > MAX_TRANSPOSE) {
    throw new RangeError(`transpose ${settings.transpose} is not a whole number of semitones in -${MAX_TRANSPOSE}…${MAX_TRANSPOSE}`);
  }
  if (!MAX_DURATION_VALUES.includes(settings.maxDurationValue)) {
    throw new RangeError(`maxDurationValue ${settings.maxDurationValue} is not one of ${MAX_DURATION_VALUES.join(', ')}`);
  }
  if (!MAX_DIVISIONS.includes(settings.maxDivision)) {
    throw new RangeError(`maxDivision ${settings.maxDivision} is not one of ${MAX_DIVISIONS.join(', ')}`);
  }
  return settings;
}
