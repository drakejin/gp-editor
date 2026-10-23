// Notes and cents of a measured frequency, following TuxGuitar's TGTuner.getNoteFrequency and
// TGTunerFineWidget.getTone (A2 = 110 Hz = MIDI 45), with the reference A4 adjustable, and the nearest string of a
// tuning as the TGTuningString buttons offer them.

export const DEFAULT_REFERENCE_A4 = 440;
/** Baroque pitch, a semitone under 440. */
export const MIN_REFERENCE_A4 = 415;
/** A semitone over 440. */
export const MAX_REFERENCE_A4 = 466;

const A4_NOTE = 69;
const CENTS_PER_SEMITONE = 100;

/** The nearest equal-tempered note (a MIDI note number) and how far the frequency is off it, in -50 … +50 cents. */
export interface NotePitch {
  readonly note: number;
  readonly cents: number;
}

/** The open string nearest a frequency: its 0-based index in the tuning, its number (1 = highest) and open note. */
export interface StringPitch extends NotePitch {
  readonly index: number;
  readonly number: number;
}

/** What the tuner shows for one frequency. */
export interface TunerReading extends NotePitch {
  readonly frequency: number;
  /** Undefined for a track without strings. */
  readonly string?: StringPitch;
}

/** The reference A4 within 415–466 Hz; 440 for a value that is not a number. */
export function clampReferenceA4(a4: number): number {
  return Number.isFinite(a4) ? Math.min(MAX_REFERENCE_A4, Math.max(MIN_REFERENCE_A4, a4)) : DEFAULT_REFERENCE_A4;
}

/** Frequency of a MIDI note (fractional notes allowed) in equal temperament. */
export function frequencyFromNote(note: number, a4 = DEFAULT_REFERENCE_A4): number {
  return a4 * 2 ** ((note - A4_NOTE) / 12);
}

/** The fractional MIDI note of a frequency: 69.25 is a quarter semitone over A4. */
export function pitchFromFrequency(frequency: number, a4 = DEFAULT_REFERENCE_A4): number {
  return A4_NOTE + 12 * Math.log2(frequency / a4);
}

export function nearestNote(frequency: number, a4 = DEFAULT_REFERENCE_A4): NotePitch {
  const pitch = pitchFromFrequency(frequency, a4);
  const note = Math.round(pitch);
  return { note, cents: (pitch - note) * CENTS_PER_SEMITONE };
}

/** The open string of `tuning` (MIDI notes, string 1 first) nearest the frequency, with the cents to it. */
export function nearestString(frequency: number, tuning: readonly number[], a4 = DEFAULT_REFERENCE_A4): StringPitch | undefined {
  const pitch = pitchFromFrequency(frequency, a4);
  return tuning.reduce<StringPitch | undefined>((best, note, index) => {
    const cents = (pitch - note) * CENTS_PER_SEMITONE;
    return best !== undefined && Math.abs(best.cents) <= Math.abs(cents) ? best : { index, number: index + 1, note, cents };
  }, undefined);
}

export function toTunerReading(frequency: number, tuning: readonly number[], a4 = DEFAULT_REFERENCE_A4): TunerReading {
  return { frequency, ...nearestNote(frequency, a4), string: nearestString(frequency, tuning, a4) };
}
