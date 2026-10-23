// Model values as GPIF writes them (no TuxGuitar counterpart): the inverses of the GPIF reader's unit conversions.
import { harmonicFretAtOffset } from '../../formats/common/harmonics';
import { dynamicOf } from '../../formats/common/velocity';
import { STROKE_TICKS_TIMES_VALUE } from '../../formats/gpif/gpif-duration';
import { CLEFS } from '../../formats/gpif/gpif-measure';
import { HARMONIC_TYPES, SLIDE_FLAGS, TRILL_TICKS_FACTOR } from '../../formats/gpif/gpif-note';
import { durationTicks } from '../../model/defaults';
import type { Clef, Duration, Harmonic, HarmonicType, NoteEffect, NoteValue, SlideType } from '../../model/song';

const NOTE_VALUE_NAMES: Readonly<Record<NoteValue, string>> = {
  1: 'Whole',
  2: 'Half',
  4: 'Quarter',
  8: 'Eighth',
  16: '16th',
  32: '32nd',
  64: '64th',
};

/** `<NoteValue>` of a duration. */
export function noteValueNameOf(value: NoteValue): string {
  return NOTE_VALUE_NAMES[value];
}

/** `<Dynamic>` (PPP … FFF) of a MIDI velocity: the nearest of the eight dynamics. */
export function dynamicNameOf(velocity: number): string {
  return dynamicOf(velocity).toUpperCase();
}

/** Brush duration in ticks (XProperty 687935489) of a stroke speed: the reader takes 1920 / ticks as the note value. */
export function brushTicksOf(strokeValue: number): number {
  return Math.round(STROKE_TICKS_TIMES_VALUE / strokeValue);
}

/** Trill speed (XProperty 688062467) in Guitar Pro's 480 ticks per quarter note. */
export function trillTicksOf(duration: Duration): number {
  return Math.round(durationTicks(duration) / TRILL_TICKS_FACTOR);
}

/** Guitar Pro's three tremolo picking speeds as `<Tremolo>` texts: eighths "1/2", sixteenths "1/4", 32nds "1/8". */
const TREMOLO_PICKING_TEXTS: readonly (readonly [NoteValue, string])[] = [
  [8, '1/2'],
  [16, '1/4'],
  [32, '1/8'],
];

/** `<Tremolo>` of a tremolo picking speed: the nearest Guitar Pro has. */
export function tremoloPickingOf(duration: Duration): string {
  const target = Math.log2(duration.value);
  const [, text] = TREMOLO_PICKING_TEXTS.reduce((best, entry) =>
    Math.abs(Math.log2(entry[0]) - target) < Math.abs(Math.log2(best[0]) - target) ? entry : best,
  );
  return text;
}

/** `<HType>` of every harmonic type (the reader's table, inverted). */
export function harmonicTypeNameOf(type: HarmonicType): string {
  const name = Object.keys(HARMONIC_TYPES).find((key) => HARMONIC_TYPES[key] === type) ?? 'natural';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Guitar Pro's harmonic fret for pinch and semi harmonics (an octave). */
const OCTAVE_HARMONIC_FRET = 12;

/**
 * `<HFret>` of a harmonic on `fret`: artificial = the harmonic fret of its offset, tapped = the tapped fret above the
 * note, natural = the note's fret, pinch / semi = an octave. Undefined when the harmonic has no fret the reader maps back.
 */
export function harmonicFretOf(harmonic: Harmonic, fret: number): number | undefined {
  switch (harmonic.type) {
    case 'artificial':
      return harmonicFretAtOffset(harmonic.data);
    case 'tapped':
      return harmonic.data - fret >= 0 && harmonic.data !== 0 ? harmonic.data - fret : undefined;
    case 'natural':
      return fret;
    default:
      return OCTAVE_HARMONIC_FRET;
  }
}

/** `<Slide><Flags>` of a note's slides. */
export function slideFlagsOf(slides: readonly SlideType[]): number {
  return SLIDE_FLAGS.filter(([, type]) => slides.includes(type)).reduce((flags, [flag]) => flags | flag, 0);
}

/** `<Accent>` of a note: staccato 1, heavy accent 4, accent 8. */
export function accentFlagsOf(effect: NoteEffect): number {
  return (effect.staccato ? 0x01 : 0) | (effect.heavyAccentuatedNote ? 0x04 : 0) | (effect.accentuatedNote ? 0x08 : 0);
}

/** `<Clef>` of a clef (the reader's table, inverted; treble is G2). */
export function clefNameOf(clef: Clef): string {
  return Object.keys(CLEFS).find((name) => CLEFS[name] === clef) ?? 'G2';
}

export interface Pitch {
  readonly step: string;
  readonly accidental: string;
  readonly octave: number;
}

const SHARP_NAMES: readonly (readonly [string, string])[] = [
  ['C', ''], ['C', '#'], ['D', ''], ['D', '#'], ['E', ''], ['F', ''], ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['A', '#'], ['B', ''],
];
const FLAT_NAMES: readonly (readonly [string, string])[] = [
  ['C', ''], ['D', 'b'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''], ['G', 'b'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', ''],
];
const SEMITONES = 12;

/** A MIDI pitch spelled for `<ConcertPitch>` / `<TransposedPitch>`: sharps unless the key has flats; middle C is C5. */
export function pitchOf(midi: number, keySignature: number): Pitch {
  const names = keySignature < 0 ? FLAT_NAMES : SHARP_NAMES;
  const pitchClass = ((midi % SEMITONES) + SEMITONES) % SEMITONES;
  const [step, accidental] = names[pitchClass] ?? ['C', ''];
  return { step, accidental, octave: Math.floor(midi / SEMITONES) };
}
