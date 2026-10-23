// One MusicXML `<note>` (no TuxGuitar reader exists): its sound, written duration, ties, tab position, velocity and lyric.
import { MAX_FRET } from '../../edit/edit-song';
import { DEFAULT_VELOCITY, MAX_VELOCITY } from '../common/velocity';
import { NORMAL_TUPLET, NOTE_VALUES, TUPLET_SIZES, durationFromTicks, durationTicks, tupletOf, withTuplets } from '../../model/defaults';
import type { Duration, NoteValue, Tuplet } from '../../model/song';
import { toTuplet } from '../../transcription/durations';
import { type XmlElement, attribute, child, childText, children, lookupName } from '../gpif/xml';
import { type NoteMarks, readNoteMarks } from './musicxml-effects';
import { clamp, divisionsToTicks, has, readIntegerIn, readNumber, readPitch, readText } from './musicxml-values';

/** A note or rest as the file writes it, before it is placed on a string. */
export interface RawNote {
  /** Position in the measure, ticks. */
  readonly tick: number;
  /** Length, ticks (0 for a grace note). */
  readonly ticks: number;
  readonly staff: number;
  readonly voice: string;
  readonly isChord: boolean;
  readonly grace?: { readonly isSlash: boolean; readonly value: number };
  readonly isRest: boolean;
  /** Sounding MIDI pitch (a transposition applied); for an unpitched note, its place on the staff. */
  readonly pitch?: number;
  readonly instrumentId?: string;
  readonly tab?: { readonly string: number; readonly fret: number };
  /** The written duration (type, dots, tuplet); undefined when the file gives none, or one the model cannot hold. */
  readonly duration?: Duration;
  readonly isTieStart: boolean;
  readonly isTieStop: boolean;
  readonly velocity?: number;
  readonly marks: NoteMarks;
  /** The sung syllable, "-" ending a syllable that a word continues (Guitar Pro's lyrics). */
  readonly lyric?: string;
}

/** What reading a note needs from the measure so far. */
export interface NoteContext {
  readonly divisions: number;
  /** Semitones from written to sounding pitch (`<transpose>`). */
  readonly transpose: number;
}

const NOTE_TYPES: Readonly<Record<string, NoteValue>> = {
  maxima: 1, long: 1, breve: 1, whole: 1, half: 2, quarter: 4, eighth: 8,
  '16th': 16, '32nd': 32, '64th': 64, '128th': 64, '256th': 64, '512th': 64, '1024th': 64,
};
/** A grace note's length in TuxGuitar's units: 1 = 64th, 2 = 32nd, 3 = 16th (and longer). */
const GRACE_VALUES: Readonly<Record<string, number>> = { '64th': 1, '128th': 1, '256th': 1, '32nd': 2 };
const LONGEST_GRACE = 3;
/** Strings a tab note may name. */
const MAX_TAB_STRING = 12;
const PERCENT = 100;
const MAX_DOTS = 2;
const MAX_MIDI_PITCH = 127;
/** Notes of a time-modification: a tuplet inside a tuplet multiplies two ratios of at most 13. */
const MAX_TUPLET_RATIO = 169;

/** Every duration the model holds, by its length in ticks (plain values before dotted ones before tuplets). */
const DURATIONS_BY_TICKS: ReadonlyMap<number, Duration> = (() => {
  const tuplets: readonly Tuplet[] = [NORMAL_TUPLET, ...TUPLET_SIZES.flatMap((size) => tupletOf(size) ?? [])];
  const byTicks = new Map<number, Duration>();
  for (const tuplet of tuplets) {
    for (const dots of [0, 1, 2]) {
      for (const value of NOTE_VALUES) {
        const duration: Duration = { value, dotted: dots === 1, doubleDotted: dots === 2, tuplet };
        const ticks = durationTicks(duration);
        if (!byTicks.has(ticks)) {
          byTicks.set(ticks, duration);
        }
      }
    }
  }
  return byTicks;
})();

/** The duration of exactly `ticks`, else the longest plain one that fits (TGDuration.fromTime). */
export function durationOfTicks(ticks: number): Duration {
  return DURATIONS_BY_TICKS.get(ticks) ?? durationFromTicks(ticks);
}

/** A tuplet the model knows (Guitar Pro's, and the compound-time duplets); undefined for any other ratio. */
function knownTuplet(actual: number, normal: number): Tuplet | undefined {
  const tuplet = toTuplet(actual);
  return tuplet.enters === actual && tuplet.times === normal ? tuplet : undefined;
}

/** Every tuplet the model knows, smallest first (the duplets of compound time included). */
const KNOWN_TUPLETS: readonly Tuplet[] = [2, ...TUPLET_SIZES, 4, 8].flatMap((size) => knownTuplet(size, toTuplet(size).times) ?? []);

/**
 * The tuplets of a time-modification: one the model knows, else a tuplet inside a tuplet whose ratios multiply to it
 * (MusicXML writes nested tuplets as the combined ratio; 15:8 reads as 5:4 inside 3:2, the smaller one outside).
 */
function readTuplets(actual: number, normal: number): Pick<Duration, 'tuplet' | 'innerTuplet'> | undefined {
  if (actual === normal) {
    return { tuplet: NORMAL_TUPLET };
  }
  const single = knownTuplet(actual, normal);
  if (single !== undefined) {
    return { tuplet: single };
  }
  for (const outer of KNOWN_TUPLETS) {
    const inner = KNOWN_TUPLETS.find((candidate) => outer.enters * candidate.enters === actual && outer.times * candidate.times === normal);
    if (inner !== undefined) {
      return { tuplet: outer, innerTuplet: inner };
    }
  }
  return undefined;
}

function readDuration(note: XmlElement): Duration | undefined {
  const value = lookupName(NOTE_TYPES, childText(note, 'type')?.trim());
  if (value === undefined) {
    return undefined;
  }
  const dots = Math.min(MAX_DOTS, children(note, 'dot').length);
  const modification = child(note, 'time-modification');
  const actual = readIntegerIn(childText(modification, 'actual-notes'), 1, MAX_TUPLET_RATIO) ?? 1;
  const normal = readIntegerIn(childText(modification, 'normal-notes'), 1, MAX_TUPLET_RATIO) ?? 1;
  const tuplets = readTuplets(actual, normal);
  return tuplets === undefined ? undefined : withTuplets({ value, dotted: dots === 1, doubleDotted: dots === 2 }, tuplets);
}

function readTab(note: XmlElement): RawNote['tab'] {
  const technical = children(note, 'notations').flatMap((notations) => children(notations, 'technical'));
  const string = technical.map((element) => readIntegerIn(childText(element, 'string'), 1, MAX_TAB_STRING)).find((value) => value !== undefined);
  const fret = technical.map((element) => readIntegerIn(childText(element, 'fret'), 0, MAX_FRET)).find((value) => value !== undefined);
  return string === undefined || fret === undefined ? undefined : { string, fret };
}

function hasTie(note: XmlElement, type: string): boolean {
  const notationTies = children(note, 'notations').flatMap((notations) => children(notations, 'tied'));
  return [...children(note, 'tie'), ...notationTies].some((tie) => attribute(tie, 'type') === type);
}

/** The first verse's syllable (lyric number 1, else the first lyric). */
function readLyric(note: XmlElement): string | undefined {
  const lyrics = children(note, 'lyric');
  const lyric = lyrics.find((candidate) => (attribute(candidate, 'number') ?? '1') === '1') ?? lyrics[0];
  if (lyric === undefined) {
    return undefined;
  }
  const text = readText(children(lyric, 'text').map((part) => part.text).join(' '));
  const syllabic = childText(lyric, 'syllabic')?.trim();
  return syllabic === 'begin' || syllabic === 'middle' ? `${text}-` : text;
}

function readVelocity(note: XmlElement): number | undefined {
  const percent = readNumber(attribute(note, 'dynamics'));
  return percent === undefined ? undefined : clamp(Math.round((percent / PERCENT) * DEFAULT_VELOCITY), 0, MAX_VELOCITY);
}

function readSound(note: XmlElement, transpose: number): number | undefined {
  const pitch = readPitch(child(note, 'pitch'));
  if (pitch !== undefined) {
    return clamp(pitch + transpose, 0, MAX_MIDI_PITCH);
  }
  return readPitch(child(note, 'unpitched'), 'display-');
}

function readGrace(note: XmlElement): RawNote['grace'] {
  const grace = child(note, 'grace');
  if (grace === undefined) {
    return undefined;
  }
  return { isSlash: attribute(grace, 'slash') === 'yes', value: lookupName(GRACE_VALUES, childText(note, 'type')?.trim()) ?? LONGEST_GRACE };
}

/** A `<note>` at `tick`; cue notes (which do not sound) read as rests. */
export function readNote(note: XmlElement, tick: number, context: NoteContext): RawNote {
  const grace = readGrace(note);
  const divisionTicks = divisionsToTicks(readNumber(childText(note, 'duration')) ?? 0, context.divisions);
  const isRest = has(note, 'rest') || has(note, 'cue');
  return {
    tick,
    ticks: grace === undefined ? Math.max(0, Math.round(divisionTicks)) : 0,
    staff: readIntegerIn(childText(note, 'staff'), 1, 16) ?? 1,
    voice: childText(note, 'voice')?.trim() || '1',
    isChord: has(note, 'chord'),
    grace,
    isRest,
    pitch: isRest ? undefined : readSound(note, context.transpose),
    instrumentId: attribute(child(note, 'instrument'), 'id'),
    tab: isRest ? undefined : readTab(note),
    duration: readDuration(note),
    isTieStart: hasTie(note, 'start'),
    isTieStop: hasTie(note, 'stop'),
    velocity: readVelocity(note),
    marks: readNoteMarks(note),
    lyric: readLyric(note),
  };
}
