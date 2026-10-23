// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser#parseNote and its effect helpers (LGPL-2.1).
import { durationFromTicks, toVibratoFlags } from '../../model/defaults';
import type {
  Bend,
  BendPoint,
  Duration,
  Grace,
  GraceTransition,
  GuitarString,
  Harmonic,
  HarmonicType,
  Note,
  NoteEffect,
  SlideType,
  Trill,
  VibratoKind,
} from '../../model/song';
import { artificialHarmonicOffsetAtFret } from '../common/harmonics';
import {
  BEND_MAX_POSITION,
  bendPositionFromGp,
  bendValueFromGp,
  tremoloBarValueFromGp,
} from '../common/bend-units';
import type { GpifBeat, GpifBendCurve, GpifNote } from './gpif-document';
import { drumkitMidi } from './gpif-drumkit';
import { dynamicVelocity, tremoloPickingDuration } from './gpif-duration';
import { lookupName } from './xml';

/** GPIF curves: offsets 0–100, values in 1/100 tone; the model uses 0–12 positions and quarter tones. */
const GP_CURVE_POSITION = 100;
const DEFAULT_MIDDLE_OFFSET = 50;
/** Middle offsets equal to 12 are skipped, as TuxGuitar does. */
const SKIPPED_MIDDLE_OFFSET = 12;
/** Trill speeds are stored with 480 ticks per quarter; the model uses 960. */
export const TRILL_TICKS_FACTOR = 2;

/** A grace beat (GPIF stores grace notes on their own beat, before the note they decorate). */
export interface GraceSource {
  readonly beat: GpifBeat;
  readonly notes: readonly GpifNote[];
  readonly duration: Duration;
}

export interface NotePosition {
  readonly fret: number;
  /** 1 = highest string. */
  readonly string: number;
}

/**
 * Fret and string of a GPIF note: its String/Fret properties, else its MIDI pitch (Midi, Tone+Octave
 * or drum Element+Variation) placed on the first string that can play it and is still free in the beat.
 * Unlike TuxGuitar, a String outside the track's strings falls back to the pitch instead of dropping
 * the note; on percussion tracks the Fret is the MIDI pitch (GP7+ drum notes may carry any String).
 */
export function notePosition(
  note: GpifNote,
  strings: readonly GuitarString[],
  usedStrings: ReadonlySet<number>,
  isPercussion: boolean,
): NotePosition | undefined {
  if (note.string >= 0 && note.fret >= 0) {
    const string = strings.length - note.string;
    if (string > 0) {
      return { fret: note.fret, string };
    }
  }
  const midi = notePitch(note, isPercussion);
  if (midi < 0) {
    return undefined;
  }
  if (isPercussion) {
    // A percussion note's fret is its MIDI pitch, whatever the (normally all-zero) tuning says.
    const free = strings.find((s) => !usedStrings.has(s.number));
    return free === undefined ? undefined : { fret: midi, string: free.number };
  }
  const free = strings.find((s) => midi >= s.tuning && !usedStrings.has(s.number));
  return free === undefined ? undefined : { fret: midi - free.tuning, string: free.number };
}

function notePitch(note: GpifNote, isPercussion: boolean): number {
  if (note.midiNumber >= 0) {
    return note.midiNumber;
  }
  if (note.tone >= 0 && note.octave >= 0) {
    return note.tone + 12 * note.octave - 12;
  }
  if (note.element >= 0) {
    return drumkitMidi(note.element, note.variation);
  }
  return isPercussion ? note.fret : -1;
}

export interface NoteContext {
  readonly beat: GpifBeat;
  readonly grace: GraceSource | undefined;
  /** Open-string pitch of the note's string. */
  readonly tuning: number;
}

export function buildNote(note: GpifNote, position: NotePosition, context: NoteContext): Note {
  return {
    fret: position.fret,
    velocity: dynamicVelocity(context.beat.dynamic),
    string: position.string,
    isTied: note.tieDestination,
    effect: buildEffect(note, position, context),
  };
}

/** Vibrato kinds, narrowest first. */
const VIBRATO_ORDER: readonly VibratoKind[] = ['none', 'slight', 'wide'];

/** The note's vibrato and its beat's whammy-bar vibrato make one vibrato: the wider of the two. */
function widerVibrato(a: VibratoKind, b: VibratoKind): VibratoKind {
  return VIBRATO_ORDER.indexOf(a) >= VIBRATO_ORDER.indexOf(b) ? a : b;
}

function buildEffect(note: GpifNote, position: NotePosition, context: NoteContext): NoteEffect {
  const { beat } = context;
  return {
    ...optionalEffects(note, position, context),
    slides: slideTypes(note),
    ...toVibratoFlags(widerVibrato(note.vibrato, beat.vibrato)),
    deadNote: note.muted,
    hammer: note.hammer,
    ghostNote: note.ghost,
    accentuatedNote: (note.accent & 0x08) !== 0,
    heavyAccentuatedNote: (note.accent & 0x04) !== 0,
    palmMute: note.palmMuted,
    staccato: (note.accent & 0x01) !== 0,
    tapping: note.tapped,
    slapping: beat.slapped,
    popping: beat.popped,
    fadeIn: beat.fadding === 'FadeIn',
    letRing: note.letRing,
  };
}

type OptionalEffects = Pick<NoteEffect, 'bend' | 'tremoloBar' | 'harmonic' | 'grace' | 'trill' | 'tremoloPicking'>;

/** The optional effects, leaving out the ones the note does not have. */
function optionalEffects(note: GpifNote, position: NotePosition, context: NoteContext): OptionalEffects {
  const bend = parseBend(note);
  const tremoloBar = parseTremoloBar(context.beat);
  const harmonic = parseHarmonic(note, position.fret);
  const grace = parseGrace(context.grace, note);
  const trill = parseTrill(note, position.fret, context.tuning);
  const picking = tremoloPickingDuration(context.beat.tremolo);
  return {
    ...(bend === undefined ? {} : { bend }),
    ...(tremoloBar === undefined ? {} : { tremoloBar }),
    ...(harmonic === undefined ? {} : { harmonic }),
    ...(grace === undefined ? {} : { grace }),
    ...(trill === undefined ? {} : { trill }),
    ...(picking === undefined ? {} : { tremoloPicking: { duration: picking } }),
  };
}

function curvePosition(offset: number): number {
  return bendPositionFromGp(offset, GP_CURVE_POSITION);
}

/** GPXDocumentParser#parseBend. */
function parseBend(note: GpifNote): Bend | undefined {
  return note.bendEnabled ? bendFromCurve(note.bend) : undefined;
}

/** The bend a GPIF bend curve reads as; undefined without an origin or destination value. */
export function bendFromCurve(curve: GpifBendCurve): Bend | undefined {
  if (curve.originValue === undefined || curve.destinationValue === undefined) {
    return undefined;
  }
  const origin = bendValueFromGp(curve.originValue);
  const destination = bendValueFromGp(curve.destinationValue);
  const points: BendPoint[] = [{ position: 0, value: origin }];
  if (curve.originOffset !== undefined) {
    points.push({ position: curvePosition(curve.originOffset), value: origin });
  }
  if (curve.middleValue !== undefined) {
    const middle = bendValueFromGp(curve.middleValue);
    for (const offset of [curve.middleOffset1, curve.middleOffset2]) {
      if (offset !== SKIPPED_MIDDLE_OFFSET) {
        points.push({ position: curvePosition(offset ?? DEFAULT_MIDDLE_OFFSET), value: middle });
      }
    }
  }
  return { points: [...points, ...curveEnd(curve, destination)] };
}

function curveEnd(curve: GpifBendCurve, destination: number): BendPoint[] {
  const points: BendPoint[] = [];
  if (curve.destinationOffset !== undefined && curve.destinationOffset < GP_CURVE_POSITION) {
    points.push({ position: curvePosition(curve.destinationOffset), value: destination });
  }
  points.push({ position: BEND_MAX_POSITION, value: destination });
  return points;
}

/** GPXDocumentParser#parseTremoloBar (values in quarter tones instead of TuxGuitar's semitones). */
function parseTremoloBar(beat: GpifBeat): Bend | undefined {
  return beat.whammyBarEnabled ? tremoloBarFromCurve(beat.whammyBar) : undefined;
}

/** The tremolo bar a GPIF whammy curve reads as; undefined without an origin or destination value. */
export function tremoloBarFromCurve(curve: GpifBendCurve): Bend | undefined {
  if (curve.originValue === undefined || curve.destinationValue === undefined) {
    return undefined;
  }
  const origin = tremoloBarValueFromGp(curve.originValue);
  const points: BendPoint[] = [{ position: 0, value: origin }];
  if (curve.originOffset !== undefined) {
    points.push({ position: curvePosition(curve.originOffset), value: origin });
  }
  const destination = tremoloBarValueFromGp(curve.destinationValue);
  return { points: [...points, ...whammyMiddle(curve), ...curveEnd(curve, destination)] };
}

function whammyMiddle(curve: GpifBendCurve): BendPoint[] {
  if (curve.middleValue === undefined) {
    return [];
  }
  const value = tremoloBarValueFromGp(curve.middleValue);
  const offset1 = curve.middleOffset1 ?? DEFAULT_MIDDLE_OFFSET;
  const offset2 = curve.middleOffset2 ?? DEFAULT_MIDDLE_OFFSET;
  const origin = curve.originOffset;
  const points: BendPoint[] = [];
  if (origin === undefined || offset1 >= origin) {
    points.push({ position: curvePosition(offset1), value });
  }
  if (origin === undefined || (offset1 >= origin && offset2 > offset1)) {
    points.push({ position: curvePosition(offset2), value });
  }
  return points;
}

export const HARMONIC_TYPES: Readonly<Record<string, HarmonicType>> = {
  natural: 'natural',
  artificial: 'artificial',
  pinch: 'pinch',
  tap: 'tapped',
  semi: 'semi',
};

/**
 * GPXDocumentParser#parseHarmonic, matching the type case-insensitively and keeping tap/semi
 * harmonics (TuxGuitar turns them into natural ones). Data: artificial = semitones above the
 * fretted note, tapped = the tapped fret.
 */
function parseHarmonic(note: GpifNote, fret: number): Harmonic | undefined {
  const name = note.harmonicType.toLowerCase();
  if (name === '' || name === 'noharmonic') {
    return undefined;
  }
  const type = lookupName(HARMONIC_TYPES, name) ?? 'natural';
  if (type === 'artificial') {
    return { type, data: artificialHarmonicOffsetAtFret(note.harmonicFret) };
  }
  if (type === 'tapped' && note.harmonicFret >= 0) {
    return { type, data: fret + note.harmonicFret };
  }
  return { type, data: 0 };
}

/** GPXDocumentParser#parseTrill. Without a Midi property the trill pitch is relative to the open string. */
function parseTrill(note: GpifNote, fret: number, tuning: number): Trill | undefined {
  if (note.trill <= 0) {
    return undefined;
  }
  const trillFret = note.midiNumber >= 0 ? fret + note.trill - note.midiNumber : note.trill - tuning;
  return {
    fret: Math.max(0, trillFret),
    duration: durationFromTicks(note.trillDuration * TRILL_TICKS_FACTOR),
  };
}

/** GPXDocumentParser#parseGraceNotes: the grace note on the same GPIF string decorates this note. */
function parseGrace(source: GraceSource | undefined, note: GpifNote): Grace | undefined {
  const grace = source?.notes.find((n) => n.string === note.string);
  if (source === undefined || grace === undefined) {
    return undefined;
  }
  return {
    fret: Math.max(0, grace.fret),
    duration: graceDuration(source.duration.value),
    velocity: dynamicVelocity(source.beat.dynamic),
    transition: graceTransition(grace),
    onBeat: source.beat.graceNotes === 'OnBeat',
    isDead: grace.muted,
  };
}

/** TGEffectGrace durations: 3 = 16th, 2 = 32nd, 1 = 64th (anything else). */
function graceDuration(value: number): number {
  if (value === 16) {
    return 3;
  }
  return value === 32 ? 2 : 1;
}

function graceTransition(grace: GpifNote): GraceTransition {
  if (grace.bendEnabled) {
    return 'bend';
  }
  if (grace.slide) {
    return 'slide';
  }
  return grace.hammer ? 'hammer' : 'none';
}

/** GPIF slide flags: 1 shift, 2 legato, 4 out down, 8 out up, 16 in from below, 32 in from above. */
export const SLIDE_FLAGS: readonly (readonly [number, SlideType])[] = [
  [0x01, 'shift'],
  [0x02, 'legato'],
  [0x04, 'outDownwards'],
  [0x08, 'outUpwards'],
  [0x10, 'intoFromBelow'],
  [0x20, 'intoFromAbove'],
];

function slideTypes(note: GpifNote): readonly SlideType[] {
  if (!note.slide) {
    return [];
  }
  return SLIDE_FLAGS.filter(([flag]) => (note.slideFlags & flag) !== 0).map(([, type]) => type);
}
