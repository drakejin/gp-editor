import { BEND_MAX_POSITION, BEND_MAX_VALUE, TREMOLO_BAR_LIMIT } from '../formats/common/bend-units';
import { MAX_VELOCITY } from '../formats/common/velocity';
import { EMPTY_NOTE_EFFECT, isNoteValue, tupletOf } from '../model/defaults';
import { MAX_DIAGRAM_STRINGS } from '../formats/gpif/gpif-read-track';
import type { Bend, BendPoint, Chord, Duration, Grace, Harmonic, NoteEffect, SlideType, TremoloPicking, Trill, Tuplet } from '../model/song';
import { type RawObject, isRawObject } from '../transcription/parse-values';
import { type EffectValue, HARMONIC_TYPES, type OptionalEffect, SLIDE_ORDER, type ToggleableEffect } from './effects';
import { GRACE_TRANSITIONS, isGraceDuration } from './ornaments';

/**
 * Checks for the values of a beat fragment read from untrusted JSON (the system clipboard): each parser returns the
 * value, or undefined for anything of the wrong type or out of range.
 */

/** Points a bend or tremolo-bar curve may have. */
export const MAX_CURVE_POINTS = 32;
/** Harmonic data is a semitone offset or a tapped fret: within the MIDI range. */
const MAX_HARMONIC_DATA = 127;
/** Characters a chord name may have. */
const MAX_CHORD_NAME_LENGTH = 256;
/** Chord diagram frets as files store them (a base fret added): within the MIDI range. */
const MAX_CHORD_FRET = 127;

/** The note effects that are on or off; every one is required. */
const EFFECT_FLAGS: readonly ToggleableEffect[] = [
  'vibrato',
  'deadNote',
  'hammer',
  'ghostNote',
  'accentuatedNote',
  'heavyAccentuatedNote',
  'palmMute',
  'staccato',
  'tapping',
  'slapping',
  'popping',
  'fadeIn',
  'letRing',
];

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** A tuplet Guitar Pro stores (tupletOf), or the normal 1:1. */
function parseTuplet(value: unknown): Tuplet | undefined {
  if (!isRawObject(value) || !isIntegerIn(value.enters, 1, Number.MAX_SAFE_INTEGER)) {
    return undefined;
  }
  const tuplet = tupletOf(value.enters);
  return tuplet !== undefined && tuplet.times === value.times ? tuplet : undefined;
}

/** A note value with at most one kind of dot, in a known tuplet. */
export function parseDuration(value: unknown): Duration | undefined {
  if (!isRawObject(value) || typeof value.value !== 'number' || !isNoteValue(value.value)) {
    return undefined;
  }
  const { dotted, doubleDotted } = value;
  const tuplet = parseTuplet(value.tuplet);
  if (typeof dotted !== 'boolean' || typeof doubleDotted !== 'boolean' || (dotted && doubleDotted) || tuplet === undefined) {
    return undefined;
  }
  return { value: value.value, dotted, doubleDotted, tuplet };
}

function parseCurvePoint(value: unknown, min: number, max: number): BendPoint | undefined {
  return isRawObject(value) && isIntegerIn(value.position, 0, BEND_MAX_POSITION) && isIntegerIn(value.value, min, max)
    ? { position: value.position, value: value.value }
    : undefined;
}

/** A bend or tremolo-bar curve: 1…MAX_CURVE_POINTS points, positions 0…12, values min…max quarter tones. */
function parseCurve(value: unknown, min: number, max: number): Bend | undefined {
  if (!isRawObject(value) || !Array.isArray(value.points) || value.points.length === 0 || value.points.length > MAX_CURVE_POINTS) {
    return undefined;
  }
  const points = value.points.map((point: unknown) => parseCurvePoint(point, min, max));
  return points.every((point): point is BendPoint => point !== undefined) ? { points } : undefined;
}

function parseHarmonic(value: unknown): Harmonic | undefined {
  if (!isRawObject(value) || !isIntegerIn(value.data, 0, MAX_HARMONIC_DATA)) {
    return undefined;
  }
  const type = HARMONIC_TYPES.find((known) => known === value.type);
  return type === undefined ? undefined : { type, data: value.data };
}

function parseGrace(value: unknown, maxFret: number): Grace | undefined {
  if (!isRawObject(value) || !isIntegerIn(value.fret, 0, maxFret) || !isIntegerIn(value.velocity, 0, MAX_VELOCITY)) {
    return undefined;
  }
  const { duration, onBeat, isDead } = value;
  const transition = GRACE_TRANSITIONS.find((known) => known === value.transition);
  if (typeof duration !== 'number' || !isGraceDuration(duration) || typeof onBeat !== 'boolean' || typeof isDead !== 'boolean' || transition === undefined) {
    return undefined;
  }
  return { fret: value.fret, duration, velocity: value.velocity, transition, onBeat, isDead };
}

function parseTrill(value: unknown, maxFret: number): Trill | undefined {
  const duration = isRawObject(value) ? parseDuration(value.duration) : undefined;
  return isRawObject(value) && isIntegerIn(value.fret, 0, maxFret) && duration !== undefined ? { fret: value.fret, duration } : undefined;
}

function parseTremoloPicking(value: unknown): TremoloPicking | undefined {
  const duration = isRawObject(value) ? parseDuration(value.duration) : undefined;
  return duration === undefined ? undefined : { duration };
}

const OPTIONAL_PARSERS: { readonly [K in OptionalEffect]: (value: unknown, maxFret: number) => EffectValue<K> | undefined } = {
  bend: (value) => parseCurve(value, 0, BEND_MAX_VALUE),
  tremoloBar: (value) => parseCurve(value, -TREMOLO_BAR_LIMIT, TREMOLO_BAR_LIMIT),
  harmonic: parseHarmonic,
  grace: parseGrace,
  trill: parseTrill,
  tremoloPicking: parseTremoloPicking,
};

const OPTIONAL_EFFECTS: readonly OptionalEffect[] = ['bend', 'tremoloBar', 'harmonic', 'grace', 'trill', 'tremoloPicking'];

/**
 * A chord diagram: a name of up to MAX_CHORD_NAME_LENGTH characters, a first fret and up to MAX_DIAGRAM_STRINGS frets
 * (-1 = not played), whole numbers up to MAX_CHORD_FRET as files store them.
 */
export function parseChord(value: unknown): Chord | undefined {
  if (!isRawObject(value) || typeof value.name !== 'string' || value.name.length > MAX_CHORD_NAME_LENGTH || !isIntegerIn(value.firstFret, -1, MAX_CHORD_FRET)) {
    return undefined;
  }
  const { frets } = value;
  if (!Array.isArray(frets) || frets.length > MAX_DIAGRAM_STRINGS || !frets.every((fret: unknown) => isIntegerIn(fret, -1, MAX_CHORD_FRET))) {
    return undefined;
  }
  return { name: value.name, firstFret: value.firstFret, frets: frets.map(Number) };
}

/** Known slides, each once, in model order. */
function parseSlides(value: unknown): readonly SlideType[] | undefined {
  if (!Array.isArray(value) || value.length > SLIDE_ORDER.length) {
    return undefined;
  }
  const slides = SLIDE_ORDER.filter((slide) => value.includes(slide));
  return slides.length === value.length ? slides : undefined;
}

function withFlags(raw: RawObject, effect: NoteEffect): NoteEffect | undefined {
  let result = effect;
  for (const flag of EFFECT_FLAGS) {
    const value = raw[flag];
    if (typeof value !== 'boolean') {
      return undefined;
    }
    result = { ...result, [flag]: value };
  }
  return result;
}

function withOptionalEffects(raw: RawObject, effect: NoteEffect, maxFret: number): NoteEffect | undefined {
  let result = effect;
  for (const key of OPTIONAL_EFFECTS) {
    if (raw[key] !== undefined) {
      const parsed = OPTIONAL_PARSERS[key](raw[key], maxFret);
      if (parsed === undefined) {
        return undefined;
      }
      result = { ...result, [key]: parsed };
    }
  }
  return result;
}

/** A note's effects: every on/off flag, the slides, and each optional effect absent or valid (frets 0…maxFret). */
export function parseNoteEffect(value: unknown, maxFret: number): NoteEffect | undefined {
  const slides = isRawObject(value) ? parseSlides(value.slides) : undefined;
  if (!isRawObject(value) || slides === undefined) {
    return undefined;
  }
  const flagged = withFlags(value, { ...EMPTY_NOTE_EFFECT, slides });
  return flagged === undefined ? undefined : withOptionalEffects(value, flagged, maxFret);
}
