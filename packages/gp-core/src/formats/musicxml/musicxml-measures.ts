// A MusicXML part's measures in time order (no TuxGuitar reader exists): attributes, directions, barlines and notes with their positions.
import { GpFormatError } from '../../errors';
import { type Clef, QUARTER_TIME, type TimeSignature } from '../../model/song';
import { type XmlElement, attribute, child, childText, children, lookupName } from '../gpif/xml';
import { DYNAMICS } from '../common/velocity';
import type { MusicXmlPart } from './musicxml-document';
import { type NoteContext, type RawNote, readNote } from './musicxml-note';
import { MAX_DIVISIONS, MAX_MEASURES, MAX_MEASURE_ELEMENTS, MAX_MEASURE_TICKS, clamp, readIntegerIn, readNumber, readPitch, readText } from './musicxml-values';

export type ClefKind = Clef | 'tab' | 'percussion';

/** A tab staff's strings, lowest first, and capo. */
export interface StaffTuning {
  readonly staff: number;
  readonly lowestFirst: readonly number[];
  readonly capo: number;
}

export interface Timed<T> {
  readonly tick: number;
  readonly value: T;
}

export interface Ending {
  readonly numbers: readonly number[];
  readonly type: string;
}

/** What one measure of a part holds. */
export interface PartMeasure {
  readonly time?: TimeSignature;
  readonly key?: number;
  readonly clefs: ReadonlyMap<number, ClefKind>;
  readonly tunings: readonly StaffTuning[];
  readonly tempos: readonly Timed<number>[];
  readonly rehearsal?: string;
  readonly isRepeatOpen: boolean;
  /** MusicXML's `times` of a backward repeat (passes in all); undefined when none closes here. */
  readonly repeatTimes?: number;
  readonly endings: readonly Ending[];
  readonly notes: readonly RawNote[];
  readonly texts: readonly Timed<string>[];
  readonly dynamics: readonly Timed<number>[];
}

/** What carries over from one measure to the next. */
interface PartState {
  divisions: number;
  transpose: number;
}

/** A measure under construction. */
interface MeasureDraft {
  time?: TimeSignature;
  key?: number;
  readonly clefs: Map<number, ClefKind>;
  readonly tunings: StaffTuning[];
  readonly tempos: Timed<number>[];
  rehearsal?: string;
  isRepeatOpen: boolean;
  repeatTimes?: number;
  readonly endings: Ending[];
  readonly notes: RawNote[];
  readonly texts: Timed<string>[];
  readonly dynamics: Timed<number>[];
}

const MAX_ACCIDENTALS = 7;
const MAX_NUMERATOR = 32;
const DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];
const MAX_STAFF_LINES = 12;
const MAX_CAPO = 24;
const MIN_TEMPO = 1;
const MAX_TEMPO = 999;
const MAX_ENDING = 31;
const SEMITONES_PER_OCTAVE = 12;
const DEFAULT_REPEAT_TIMES = 2;
const PALM_MUTE_TEXT = /^p\.?\s*m\.?$/i;

/** Quarter notes in a metronome's beat unit. */
const BEAT_UNITS: Readonly<Record<string, number>> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };
const DOTTED = 1.5;

const CLEF_KINDS: Readonly<Record<string, ClefKind>> = { G: 'treble', F: 'bass', percussion: 'percussion', TAB: 'tab' };

function readClef(clef: XmlElement): ClefKind {
  const sign = childText(clef, 'sign')?.trim() ?? 'G';
  if (sign === 'C') {
    return readIntegerIn(childText(clef, 'line'), 1, 5) === 4 ? 'tenor' : 'alto';
  }
  return lookupName(CLEF_KINDS, sign) ?? 'treble';
}

/** `<time>`: the beats ("3+2" adds up) over the beat type; several pairs are added up over the smallest beat type. */
function readTime(time: XmlElement): TimeSignature | undefined {
  const beats = children(time, 'beats').map((element) => element.text.split('+').reduce((sum, part) => sum + (readNumber(part) ?? Number.NaN), 0));
  const types = children(time, 'beat-type').map((element) => readNumber(element.text) ?? Number.NaN);
  const denominator = Math.max(...types);
  const numerator = beats.reduce((sum, count, index) => sum + (count * denominator) / (types[index] ?? Number.NaN), 0);
  if (!DENOMINATORS.includes(denominator) || !Number.isInteger(numerator) || numerator < 1 || numerator > MAX_NUMERATOR) {
    return undefined;
  }
  return { numerator, denominator };
}

function readTuning(details: XmlElement): StaffTuning | undefined {
  const lines = readIntegerIn(childText(details, 'staff-lines'), 1, MAX_STAFF_LINES);
  const tunings = children(details, 'staff-tuning')
    .map((tuning) => ({ line: readIntegerIn(attribute(tuning, 'line'), 1, MAX_STAFF_LINES) ?? 0, pitch: readPitch(tuning, 'tuning-') }))
    .sort((a, b) => a.line - b.line);
  const pitches = tunings.flatMap((tuning) => (tuning.pitch === undefined ? [] : [tuning.pitch]));
  if (pitches.length === 0 || pitches.length !== tunings.length || (lines !== undefined && lines !== pitches.length)) {
    return undefined;
  }
  const staff = readIntegerIn(attribute(details, 'number'), 1, 16) ?? 1;
  return { staff, lowestFirst: pitches, capo: readIntegerIn(childText(details, 'capo'), 0, MAX_CAPO) ?? 0 };
}

function readAttributes(attributes: XmlElement, state: PartState, draft: MeasureDraft): void {
  const divisions = readNumber(childText(attributes, 'divisions'));
  if (divisions !== undefined && divisions > 0 && divisions <= MAX_DIVISIONS) {
    state.divisions = divisions;
  }
  const fifths = readNumber(childText(child(attributes, 'key'), 'fifths'));
  if (fifths !== undefined) {
    draft.key = clamp(Math.round(fifths), -MAX_ACCIDENTALS, MAX_ACCIDENTALS);
  }
  const time = child(attributes, 'time');
  draft.time = (time === undefined ? undefined : readTime(time)) ?? draft.time;
  for (const clef of children(attributes, 'clef')) {
    const staff = readIntegerIn(attribute(clef, 'number'), 1, 16) ?? 1;
    if (!draft.clefs.has(staff)) {
      draft.clefs.set(staff, readClef(clef));
    }
  }
  children(attributes, 'staff-details').forEach((details) => draft.tunings.push(...[readTuning(details)].flatMap((tuning) => tuning ?? [])));
  const transpose = child(attributes, 'transpose');
  if (transpose !== undefined) {
    const chromatic = readNumber(childText(transpose, 'chromatic')) ?? 0;
    const octaves = readNumber(childText(transpose, 'octave-change')) ?? 0;
    state.transpose = clamp(Math.round(chromatic + octaves * SEMITONES_PER_OCTAVE), -48, 48);
  }
}

function metronomeTempo(metronome: XmlElement | undefined): number | undefined {
  const perMinute = readNumber(childText(metronome, 'per-minute'));
  const unit = lookupName(BEAT_UNITS, childText(metronome, 'beat-unit')?.trim());
  if (perMinute === undefined || unit === undefined) {
    return undefined;
  }
  return perMinute * unit * (children(metronome, 'beat-unit-dot').length > 0 ? DOTTED : 1);
}

function toTempo(value: number | undefined): number | undefined {
  return value === undefined || value <= 0 ? undefined : clamp(Math.round(value), MIN_TEMPO, MAX_TEMPO);
}

const DYNAMIC_VELOCITIES: Readonly<Record<string, number>> = Object.fromEntries(DYNAMICS.map((dynamic) => [dynamic.name, dynamic.velocity]));

function readDirection(direction: XmlElement, tick: number, draft: MeasureDraft): void {
  const types = children(direction, 'direction-type');
  const soundTempo = toTempo(readNumber(attribute(child(direction, 'sound'), 'tempo')));
  const tempo = soundTempo ?? toTempo(types.map((type) => metronomeTempo(child(type, 'metronome'))).find((value) => value !== undefined));
  if (tempo !== undefined) {
    draft.tempos.push({ tick, value: tempo });
  }
  for (const type of types) {
    const rehearsal = readText(childText(type, 'rehearsal'));
    if (rehearsal !== '' && draft.rehearsal === undefined) {
      draft.rehearsal = rehearsal;
    }
    const words = readText(children(type, 'words').map((element) => element.text).join(' '));
    if (words !== '' && !PALM_MUTE_TEXT.test(words)) {
      draft.texts.push({ tick, value: words });
    }
    const velocity = children(type, 'dynamics').flatMap((dynamics) => dynamics.children.flatMap((mark) => lookupName(DYNAMIC_VELOCITIES, mark.name) ?? []))[0];
    if (velocity !== undefined) {
      draft.dynamics.push({ tick, value: velocity });
    }
  }
}

function readBarline(barline: XmlElement, draft: MeasureDraft): void {
  const repeat = attribute(child(barline, 'repeat'), 'direction');
  if (repeat === 'forward') {
    draft.isRepeatOpen = true;
  } else if (repeat === 'backward') {
    draft.repeatTimes = readIntegerIn(attribute(child(barline, 'repeat'), 'times'), 1, 64) ?? DEFAULT_REPEAT_TIMES;
  }
  const ending = child(barline, 'ending');
  if (ending !== undefined) {
    const numbers = (attribute(ending, 'number') ?? '')
      .split(/[\s,]+/)
      .flatMap((part) => readIntegerIn(part, 1, MAX_ENDING) ?? []);
    draft.endings.push({ numbers, type: attribute(ending, 'type') ?? 'start' });
  }
}

function newDraft(): MeasureDraft {
  return { clefs: new Map(), tunings: [], tempos: [], isRepeatOpen: false, endings: [], notes: [], texts: [], dynamics: [] };
}

/** One measure: the time cursor moves with notes, backups and forwards; positions past MAX_MEASURE_TICKS are dropped. */
function readMeasure(measure: XmlElement, state: PartState, measureNumber: number): PartMeasure {
  if (measure.children.length > MAX_MEASURE_ELEMENTS) {
    throw new GpFormatError(`MusicXML measure ${measureNumber} has more than ${MAX_MEASURE_ELEMENTS} elements`);
  }
  const draft = newDraft();
  let cursor = 0;
  let onset = 0;
  const ticksOf = (element: XmlElement): number => Math.max(0, (readNumber(childText(element, 'duration')) ?? 0) * (QUARTER_TIME / state.divisions));
  for (const element of measure.children) {
    const tick = Math.round(cursor);
    switch (element.name) {
      case 'attributes':
        readAttributes(element, state, draft);
        break;
      case 'note': {
        const context: NoteContext = { divisions: state.divisions, transpose: state.transpose };
        const isChord = child(element, 'chord') !== undefined;
        const note = readNote(element, isChord ? onset : tick, context);
        if (note.tick <= MAX_MEASURE_TICKS) {
          draft.notes.push(note);
        }
        if (!isChord && note.grace === undefined) {
          onset = tick;
          cursor += ticksOf(element);
        }
        break;
      }
      case 'backup':
        cursor = Math.max(0, cursor - ticksOf(element));
        break;
      case 'forward':
        cursor += ticksOf(element);
        break;
      case 'direction':
        readDirection(element, tick, draft);
        break;
      case 'sound':
        readDirection({ ...element, name: 'direction', children: [element] }, tick, draft);
        break;
      case 'barline':
        readBarline(element, draft);
        break;
      default:
        break;
    }
    cursor = Math.min(cursor, MAX_MEASURE_TICKS + 1);
  }
  return draft;
}

/** Every measure of a part, in order. */
export function readPartMeasures(part: MusicXmlPart): readonly PartMeasure[] {
  if (part.measures.length > MAX_MEASURES) {
    throw new GpFormatError(`MusicXML part ${part.id} has ${part.measures.length} measures; at most ${MAX_MEASURES} are read`);
  }
  const state: PartState = { divisions: 1, transpose: 0 };
  return part.measures.map((measure, index) => readMeasure(measure, state, index + 1));
}
