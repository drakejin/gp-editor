// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeTechnicalNotations / #writeOrnamentsNotations / #writeArticulationNotations (LGPL-2.1).
import { bendShapeOf } from '../../edit/bend-shapes';
import type { Bend, Duration, Harmonic, Note, SlideType, StrokeDirection } from '../../model/song';
import { type XmlNode, element, elementIfAny, textElement } from './xml-text';

/** What a note's technical marks depend on besides the note itself. */
export interface TechnicalInput {
  readonly note: Note;
  /** The note on the same string in the voice's next event, if any. */
  readonly next: Note | undefined;
  /** The note on the same string in the voice's previous event, if any. */
  readonly previous: Note | undefined;
  /** Tab staff: the string and fret are written. */
  readonly isTab: boolean;
  /** Not the first note of its beat: the pick stroke is written once. */
  readonly isChordNote: boolean;
  readonly pickStroke: StrokeDirection;
}

/** A legato step between two notes on one string: up the neck is a hammer-on, down (or level) a pull-off. */
type LegatoKind = 'hammer-on' | 'pull-off';

function legatoKind(from: Note, to: Note): LegatoKind {
  return to.fret > from.fret ? 'hammer-on' : 'pull-off';
}

const LEGATO_TEXT: Readonly<Record<LegatoKind, string>> = { 'hammer-on': 'H', 'pull-off': 'P' };

/**
 * The hammer-on or pull-off this note ends (previous note's hammer) and the one it starts (its own, to the next note; a
 * hammer-on as TuxGuitar writes it when no note follows on the string, so the mark is kept).
 */
function legatoMarks({ note, next, previous }: TechnicalInput): XmlNode[] {
  const marks: XmlNode[] = [];
  if (previous?.effect.hammer === true) {
    marks.push(element(legatoKind(previous, note), { type: 'stop' }));
  }
  if (note.effect.hammer) {
    const kind = next === undefined ? 'hammer-on' : legatoKind(note, next);
    marks.push(textElement(kind, LEGATO_TEXT[kind], { type: 'start' }));
  }
  return marks;
}

interface BendStep {
  /** Semitones (MusicXML's bend-alter); the model keeps quarter tones. */
  readonly alter: number;
  readonly kind: 'bend' | 'pre-bend' | 'release';
}

const QUARTER_TONES_PER_SEMITONE = 2;

/** A curve's values with repeats in a row left out: the levels it moves between. */
function curveLevels(curve: Bend): readonly number[] {
  return curve.points.map((point) => point.value).filter((value, index, all) => index === 0 || value !== all[index - 1]);
}

/**
 * The bend as MusicXML's sequence of steps: the curve's distinct values in order, each step relative to the one before
 * (TuxGuitar writes absolute values); a curve that starts bent is a pre-bend, a step down a release. A bend held from
 * the note before ('release' of bendShapeOf) is a release alone.
 */
export function bendSteps(bend: Bend): readonly BendStep[] {
  const values = curveLevels(bend);
  const shaped = bendShapeOf(bend);
  if (shaped?.shape === 'release') {
    return [{ alter: -shaped.amount / QUARTER_TONES_PER_SEMITONE, kind: 'release' }];
  }
  return values.flatMap((value, index): BendStep[] => {
    const before = index === 0 ? 0 : (values[index - 1] ?? 0);
    if (index === 0) {
      return value === 0 ? [] : [{ alter: value / QUARTER_TONES_PER_SEMITONE, kind: 'pre-bend' }];
    }
    return [{ alter: (value - before) / QUARTER_TONES_PER_SEMITONE, kind: value < before ? 'release' : 'bend' }];
  });
}

/** The tremolo bar as bend steps (TuxGuitar's TODO "with-bar"): a curve that starts away from the pitch is a pre-bend. */
export function tremoloBarSteps(bar: Bend): readonly BendStep[] {
  const values = curveLevels(bar);
  return values.flatMap((value, index): BendStep[] => {
    if (index === 0) {
      return value === 0 ? [] : [{ alter: value / QUARTER_TONES_PER_SEMITONE, kind: 'pre-bend' }];
    }
    return [{ alter: (value - (values[index - 1] ?? 0)) / QUARTER_TONES_PER_SEMITONE, kind: 'bend' }];
  });
}

function bendElements(steps: readonly BendStep[], isWithBar: boolean): XmlNode[] {
  return steps.map((step) =>
    element('bend', {}, [textElement('bend-alter', step.alter), step.kind !== 'bend' && element(step.kind), isWithBar && element('with-bar')]),
  );
}

/** Natural harmonics are natural; artificial, pinch and tapped ones artificial; a semi-harmonic has no kind. */
function harmonicElement(harmonic: Harmonic | undefined): XmlNode | undefined {
  if (harmonic === undefined) {
    return undefined;
  }
  const kind = harmonic.type === 'natural' ? 'natural' : harmonic.type === 'semi' ? undefined : 'artificial';
  return element('harmonic', {}, [kind !== undefined && element(kind)]);
}

function pickStrokeElement(input: TechnicalInput): XmlNode | undefined {
  if (input.isChordNote || input.pickStroke === 'none') {
    return undefined;
  }
  return element(input.pickStroke === 'up' ? 'up-bow' : 'down-bow');
}

/** `<technical>`: string and fret on the tab staff, hammer-ons and pull-offs, tapping, pick stroke, bends, harmonic. */
export function technicalElement(input: TechnicalInput): XmlNode | undefined {
  const { note, isTab } = input;
  return elementIfAny('technical', [
    isTab && textElement('fret', note.fret),
    isTab && textElement('string', note.string),
    ...legatoMarks(input),
    note.effect.tapping && element('tap'),
    pickStrokeElement(input),
    ...bendElements(note.effect.bend === undefined ? [] : bendSteps(note.effect.bend), false),
    ...bendElements(note.effect.tremoloBar === undefined ? [] : tremoloBarSteps(note.effect.tremoloBar), true),
    harmonicElement(note.effect.harmonic),
  ]);
}

/** Slides off or onto a note: MusicXML's falloff, doit, scoop and plop. */
const SLIDE_ARTICULATIONS: Readonly<Partial<Record<SlideType, string>>> = {
  outDownwards: 'falloff',
  outUpwards: 'doit',
  intoFromBelow: 'scoop',
  intoFromAbove: 'plop',
};

export function articulationsElement(note: Note): XmlNode | undefined {
  const { effect } = note;
  return elementIfAny('articulations', [
    effect.accentuatedNote && element('accent'),
    effect.heavyAccentuatedNote && element('strong-accent'),
    effect.staccato && element('staccato'),
    ...effect.slides.flatMap((slide) => {
      const name = SLIDE_ARTICULATIONS[slide];
      return name === undefined ? [] : [element(name)];
    }),
  ]);
}

const QUARTER_NOTE_VALUE = 4;
const TRILL_STEPS: Readonly<Record<number, string>> = { 1: 'half', 2: 'whole' };

function tremoloMarks(value: number): number {
  let marks = 0;
  for (let loop = QUARTER_NOTE_VALUE; loop < value; loop *= 2) {
    marks++;
  }
  return marks;
}

function trillBeats(trillValue: number, noteDuration: Duration): number {
  const beats = Math.floor(trillValue / noteDuration.value);
  if (noteDuration.dotted) {
    return Math.floor((beats * 3) / 2);
  }
  return noteDuration.doubleDotted ? Math.floor((beats * 7) / 4) : beats;
}

/** SMuFL wiggles of MusicXML's wavy-line: a slight and a wide vibrato. */
const VIBRATO_WIGGLES = { slight: 'wiggleVibrato', wide: 'wiggleVibratoWide' } as const;

function vibratoLines(note: Note): XmlNode[] {
  const { effect } = note;
  if (!effect.vibrato && !effect.wideVibrato) {
    return [];
  }
  const smufl = effect.wideVibrato ? VIBRATO_WIGGLES.wide : VIBRATO_WIGGLES.slight;
  return [element('wavy-line', { type: 'start', smufl }), element('wavy-line', { type: 'stop' })];
}

/** `<ornaments>`: tremolo picking, trill, vibrato (as a wavy line). */
export function ornamentsElement(note: Note, duration: Duration): XmlNode | undefined {
  const { tremoloPicking, trill } = note.effect;
  const beats = trill === undefined ? 0 : trillBeats(trill.duration.value, duration);
  return elementIfAny('ornaments', [
    tremoloPicking !== undefined && textElement('tremolo', tremoloMarks(tremoloPicking.duration.value)),
    trill !== undefined &&
      element('trill-mark', { 'trill-step': TRILL_STEPS[trill.fret - note.fret] ?? 'unison', beats: beats > 1 ? beats : undefined }),
    ...vibratoLines(note),
  ]);
}
