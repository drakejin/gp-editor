// Note effects from MusicXML notations (no TuxGuitar reader exists; the marks mirror TuxGuitar's MusicXMLWriter).
import { BEND_MAX_VALUE } from '../common/bend-units';
import { EMPTY_NOTE_EFFECT, NORMAL_TUPLET, toVibratoFlags } from '../../model/defaults';
import type { Bend, BendPoint, Duration, Harmonic, NoteEffect, NoteValue, SlideType, StrokeDirection, VibratoKind } from '../../model/song';
import { type XmlElement, attribute, child, childText, children, lookupName } from '../gpif/xml';
import { clamp, has, readIntegerIn, readNumber } from './musicxml-values';

/** One `<bend>`: semitones relative to the bend before it, and whether it is a pre-bend or a release. */
export interface BendStep {
  readonly alter: number;
  readonly isPreBend: boolean;
  readonly isRelease: boolean;
}

/** What a note's notations, notehead and play elements say, before it is a NoteEffect. */
export interface NoteMarks {
  /** A hammer-on or pull-off starts on the note. */
  readonly isLegatoStart: boolean;
  readonly isSlurStart: boolean;
  readonly isSlideStart: boolean;
  readonly bends: readonly BendStep[];
  readonly harmonic?: Harmonic;
  readonly vibrato: VibratoKind;
  readonly isLetRing: boolean;
  readonly isPalmMute: boolean;
  readonly isDead: boolean;
  readonly isGhost: boolean;
  readonly isAccent: boolean;
  readonly isStrongAccent: boolean;
  readonly isStaccato: boolean;
  readonly isTapping: boolean;
  readonly slides: readonly SlideType[];
  /** Trill: frets above the note, and MusicXML's beats (notes in the trill). */
  readonly trill?: { readonly step: number; readonly beats: number | undefined };
  readonly tremoloMarks?: number;
  readonly pickStroke: StrokeDirection;
}

/** Slides off or onto a note (what the writer writes for them). */
const SLIDE_ARTICULATIONS: Readonly<Record<string, SlideType>> = {
  falloff: 'outDownwards',
  doit: 'outUpwards',
  scoop: 'intoFromBelow',
  plop: 'intoFromAbove',
};
const TRILL_STEPS: Readonly<Record<string, number>> = { half: 1, whole: 2, unison: 2 };
/** An artificial harmonic sounds an octave above the fretted note unless the file says otherwise. */
const ARTIFICIAL_HARMONIC_OFFSET = 12;
const MAX_TREMOLO_MARKS = 8;
const WIDE_VIBRATO = /wide/i;

function allOf(notations: readonly XmlElement[], name: string): XmlElement[] {
  return notations.flatMap((notation) => children(notation, name));
}

function inside(groups: readonly XmlElement[], name: string): XmlElement[] {
  return groups.flatMap((group) => children(group, name));
}

function hasStart(elements: readonly XmlElement[]): boolean {
  return elements.some((element) => attribute(element, 'type') === 'start');
}

function readBends(technical: readonly XmlElement[]): BendStep[] {
  return inside(technical, 'bend').flatMap((bend) => {
    const alter = readNumber(childText(bend, 'bend-alter'));
    return alter === undefined ? [] : [{ alter, isPreBend: has(bend, 'pre-bend'), isRelease: has(bend, 'release') }];
  });
}

function readHarmonic(technical: readonly XmlElement[]): Harmonic | undefined {
  const harmonic = inside(technical, 'harmonic')[0];
  if (harmonic === undefined) {
    return undefined;
  }
  return has(harmonic, 'artificial') ? { type: 'artificial', data: ARTIFICIAL_HARMONIC_OFFSET } : { type: 'natural', data: 0 };
}

function readVibrato(ornaments: readonly XmlElement[]): VibratoKind {
  const line = inside(ornaments, 'wavy-line').find((wavy) => attribute(wavy, 'type') === 'start');
  if (line === undefined) {
    return inside(ornaments, 'vibrato').length > 0 ? 'slight' : 'none';
  }
  return WIDE_VIBRATO.test(attribute(line, 'smufl') ?? '') ? 'wide' : 'slight';
}

function readTrill(ornaments: readonly XmlElement[]): NoteMarks['trill'] {
  const mark = inside(ornaments, 'trill-mark')[0];
  if (mark === undefined) {
    return undefined;
  }
  return { step: lookupName(TRILL_STEPS, attribute(mark, 'trill-step')) ?? TRILL_STEPS.whole ?? 2, beats: readIntegerIn(attribute(mark, 'beats'), 1, 64) };
}

function readPickStroke(technical: readonly XmlElement[]): StrokeDirection {
  if (inside(technical, 'up-bow').length > 0) {
    return 'up';
  }
  return inside(technical, 'down-bow').length > 0 ? 'down' : 'none';
}

/** The marks of a `<note>`: its notations, notehead and play elements. */
export function readNoteMarks(note: XmlElement): NoteMarks {
  const notations = children(note, 'notations');
  const technical = allOf(notations, 'technical');
  const articulations = allOf(notations, 'articulations');
  const ornaments = allOf(notations, 'ornaments');
  const tremolo = inside(ornaments, 'tremolo').find((element) => (attribute(element, 'type') ?? 'single') === 'single');
  const notehead = child(note, 'notehead');
  const mutes = children(child(note, 'play'), 'mute').map((mute) => mute.text.trim());
  return {
    isLegatoStart: hasStart([...inside(technical, 'hammer-on'), ...inside(technical, 'pull-off')]),
    isSlurStart: hasStart(allOf(notations, 'slur')),
    isSlideStart: hasStart([...allOf(notations, 'slide'), ...allOf(notations, 'glissando')]),
    bends: readBends(technical),
    harmonic: readHarmonic(technical),
    vibrato: readVibrato(ornaments),
    isLetRing: allOf(notations, 'tied').some((tied) => attribute(tied, 'type') === 'let-ring'),
    isPalmMute: mutes.includes('palm'),
    isDead: notehead?.text.trim() === 'x' || mutes.includes('straight'),
    isGhost: attribute(notehead, 'parentheses') === 'yes',
    isAccent: inside(articulations, 'accent').length > 0,
    isStrongAccent: inside(articulations, 'strong-accent').length > 0,
    isStaccato: inside(articulations, 'staccato').length > 0 || inside(articulations, 'staccatissimo').length > 0,
    isTapping: inside(technical, 'tap').length > 0,
    slides: articulations.flatMap((group) => group.children.flatMap((mark) => lookupName(SLIDE_ARTICULATIONS, mark.name) ?? [])),
    trill: readTrill(ornaments),
    tremoloMarks: tremolo === undefined ? undefined : readIntegerIn(tremolo.text, 0, MAX_TREMOLO_MARKS),
    pickStroke: readPickStroke(technical),
  };
}

const QUARTER_TONES_PER_SEMITONE = 2;
const BEND_END = 12;

function toBendValue(semitones: number): number {
  return clamp(Math.round(semitones * QUARTER_TONES_PER_SEMITONE), 0, BEND_MAX_VALUE);
}

/** The value after a step: relative, as MusicXML has it; a release by 0 or more is TuxGuitar's absolute value. */
function afterStep(value: number, step: BendStep): number {
  if (step.isRelease && step.alter >= 0) {
    return toBendValue(step.alter);
  }
  return toBendValue(value / QUARTER_TONES_PER_SEMITONE + step.alter);
}

/**
 * The bend of a note from its steps: a pre-bend starts the curve bent, a release that comes first starts it bent too (the
 * bend is held from the note before), every other step moves the value. The curve holds each value as long as it took
 * to reach it (a pre-bend is held for one such span), so the steps of buildBend's shapes read back as those shapes.
 */
export function bendFromSteps(steps: readonly BendStep[]): Bend | undefined {
  const [first, ...rest] = steps;
  if (first === undefined) {
    return undefined;
  }
  const isPreBend = first.isPreBend;
  const start = isPreBend ? toBendValue(first.alter) : first.isRelease && first.alter < 0 ? toBendValue(-first.alter) : 0;
  const moves = isPreBend ? rest : steps;
  const step = BEND_END / (moves.length * 2 + (isPreBend ? 1 : 0));
  const points: BendPoint[] = [{ position: 0, value: start }];
  let value = start;
  let position = 0;
  if (isPreBend) {
    position += step;
    points.push({ position: Math.round(position), value });
  }
  for (const move of moves) {
    value = afterStep(value, move);
    position += step;
    points.push({ position: Math.round(position), value });
    position += step;
    points.push({ position: Math.round(position), value });
  }
  return points.some((point) => point.value > 0) ? { points } : undefined;
}

/** The tremolo picking speed for MusicXML's marks (one mark: eighths); undefined for none. */
function tremoloValue(marks: number | undefined): NoteValue | undefined {
  if (marks === undefined || marks <= 0) {
    return undefined;
  }
  const value = 4 * 2 ** marks;
  return value >= 32 ? 32 : value >= 16 ? 16 : 8;
}

function plain(value: NoteValue): Duration {
  return { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

function trillValue(noteValue: NoteValue, beats: number | undefined): NoteValue {
  const value = noteValue * (beats ?? 4);
  return value >= 64 ? 64 : value >= 32 ? 32 : 16;
}

/** The note effect of the marks (the grace note is attached later); `fret` places a trill, `noteValue` times it. */
export function toNoteEffect(marks: NoteMarks, fret: number, noteValue: NoteValue, isPercussion: boolean): NoteEffect {
  const bend = bendFromSteps(marks.bends);
  const tremolo = tremoloValue(marks.tremoloMarks);
  const slides: SlideType[] = [...(marks.isSlideStart ? [marks.isSlurStart ? ('legato' as const) : ('shift' as const)] : []), ...marks.slides];
  return {
    ...EMPTY_NOTE_EFFECT,
    ...(bend === undefined ? {} : { bend }),
    ...(marks.harmonic === undefined ? {} : { harmonic: marks.harmonic }),
    ...(marks.trill === undefined ? {} : { trill: { fret: fret + marks.trill.step, duration: plain(trillValue(noteValue, marks.trill.beats)) } }),
    ...(tremolo === undefined ? {} : { tremoloPicking: { duration: plain(tremolo) } }),
    ...toVibratoFlags(marks.vibrato),
    slides,
    hammer: marks.isLegatoStart,
    deadNote: marks.isDead && !isPercussion,
    ghostNote: marks.isGhost,
    accentuatedNote: marks.isAccent,
    heavyAccentuatedNote: marks.isStrongAccent,
    palmMute: marks.isPalmMute,
    staccato: marks.isStaccato,
    tapping: marks.isTapping,
    letRing: marks.isLetRing,
  };
}
