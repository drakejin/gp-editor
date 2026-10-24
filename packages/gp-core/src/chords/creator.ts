// Port of TuxGuitar app.tuxguitar.app.view.dialog.chord.TGChordCreatorUtil (LGPL-2.1): voicings of a chord on a tuning,
// best first.
import type { Chord } from '../model/song';
import { chordType } from './database';
import { BASS_ROLE, ESSENTIAL_ROLE, NOT_ESSENTIAL_ROLE, type StringValue, VOICING_GRADES, type VoicingContext, type VoicingStyle, voicingPriority } from './grades';
import { type NoteSpelling, chordName } from './naming';
import { chordFirstFret } from './shape';
import { type ChordSpec, chordSpecDegrees, degreePitchClass, normalizeChordSpec, pitchClass } from './spec';

export interface VoicingOptions {
  /** TGChordSettings' chord type (default normal). */
  readonly style?: VoicingStyle;
  /** Most voicings returned (TGChordSettings.chordsToDisplay, 30). */
  readonly maxVoicings?: number;
  /** Frets searched, inclusive (TGChordSettings.findChordsMin / Max: 0 to 15). */
  readonly minFret?: number;
  readonly maxFret?: number;
  /** Open strings do not count in the fret span (and are tried below `minFret`): TGChordSettings.emptyStringChords. */
  readonly preferOpenStrings?: boolean;
  readonly spelling?: NoteSpelling;
}

/** Frets a hand reaches: the span of a voicing stays below this (TGChordCreatorUtil.MAX_FRET_SPAN). */
export const MAX_FRET_SPAN = 5;
const DEFAULT_MAX_VOICINGS = 30;
const DEFAULT_MAX_FRET = 15;
/** Voicings graded at most, so an extended chord on an 8-string guitar stays quick; TuxGuitar grades them all. */
const MAX_COMBINATIONS = 120_000;
const ESSENTIAL_EXPANDING = 2;

function voicingContext(spec: ChordSpec, strings: readonly number[], options: VoicingOptions): VoicingContext {
  const { required, expanding } = chordSpecDegrees(spec);
  return {
    tuning: strings,
    root: spec.root,
    bass: spec.bass,
    required,
    expanding,
    extensionLevel: ['none', '9', '11', '13'].indexOf(spec.extension),
    isSus: chordType(spec.type).name.includes('sus'),
    isFifthAltered: spec.fifth !== 'natural',
    grades: VOICING_GRADES[options.style ?? 'normal'],
    preferOpenStrings: options.preferOpenStrings === true,
    maxFret: options.maxFret ?? DEFAULT_MAX_FRET,
  };
}

/** TuxGuitar's find: what the note at a fret is to the chord — a required note, an added one, the bass — if anything. */
function notesAt(string: number, fret: number, context: VoicingContext): readonly StringValue[] {
  const pc = pitchClass((context.tuning[string] ?? 0) + fret);
  const requiredIndex = context.required.findIndex((degree) => degreePitchClass(context.root, degree) === pc);
  if (requiredIndex >= 0) {
    return [{ string, fret, role: requiredIndex }];
  }
  const added = context.expanding.flatMap((degree, index) =>
    degreePitchClass(context.root, degree) === pc ? [{ string, fret, role: index < ESSENTIAL_EXPANDING ? ESSENTIAL_ROLE : NOT_ESSENTIAL_ROLE }] : [],
  );
  if (added.length > 0) {
    return added;
  }
  return pc === context.bass ? [{ string, fret, role: BASS_ROLE }] : [];
}

/** makePotentialNotes: every chord note on every string within the frets searched. */
function potentialNotes(context: VoicingContext, minFret: number): readonly (readonly StringValue[])[] {
  const frets = Array.from({ length: Math.max(0, context.maxFret - minFret + 1) }, (_, i) => minFret + i);
  const searched = minFret > 0 && context.preferOpenStrings ? [0, ...frets] : frets;
  return context.tuning.map((_, string) => searched.flatMap((fret) => notesAt(string, fret, context)));
}

/**
 * makeCombinations: one note or none per string, at least two strings, within MAX_FRET_SPAN frets (open strings left
 * out of the span when preferred). Each combination is built once, depth first, lowest string first.
 */
function combineStrings(potential: readonly (readonly StringValue[])[], context: VoicingContext): readonly (readonly StringValue[])[] {
  const results: (readonly StringValue[])[] = [];
  const visit = (string: number, chosen: readonly StringValue[], low: number, high: number): void => {
    if (results.length >= MAX_COMBINATIONS) {
      return;
    }
    if (string === potential.length) {
      if (chosen.length >= 2) {
        results.push(chosen);
      }
      return;
    }
    visit(string + 1, chosen, low, high);
    for (const value of potential[string] ?? []) {
      const counts = value.fret !== 0 || !context.preferOpenStrings;
      const nextLow = counts ? Math.min(low, value.fret) : low;
      const nextHigh = counts ? Math.max(high, value.fret) : high;
      if (!(nextHigh - nextLow >= MAX_FRET_SPAN)) {
        visit(string + 1, chosen.concat(value), nextLow, nextHigh);
      }
    }
  };
  visit(0, [], Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
  return results;
}

/** checkIfSubset: the same frets on every string both play (a subset or superset of a better voicing). */
function isDuplicate(combination: readonly StringValue[], chosen: readonly (readonly StringValue[])[]): boolean {
  return chosen.some((better) => better.every((value) => combination.every((other) => other.string !== value.string || other.fret === value.fret)));
}

/** A voicing with its place in the search and its rounded priority. */
interface RankedVoicing {
  readonly combination: readonly StringValue[];
  readonly order: number;
  readonly priority: number;
}

/**
 * TuxGuitar's comparator, within one rounded priority (priorities within half a point tie): the fuller voicing first
 * (320003 before 32000x, which then only repeats it), then the order they were built in.
 */
function byFullness(a: RankedVoicing, b: RankedVoicing): number {
  return b.combination.length - a.combination.length || a.order - b.order;
}

/** The voicings grouped by priority, best first; each group in the order the search built them. */
function priorityGroups(voicings: readonly RankedVoicing[]): readonly (readonly RankedVoicing[])[] {
  const groups = new Map<number, RankedVoicing[]>();
  for (const voicing of voicings) {
    const group = groups.get(voicing.priority);
    if (group === undefined) {
      groups.set(voicing.priority, [voicing]);
    } else {
      group.push(voicing);
    }
  }
  return [...groups.keys()].sort((a, b) => b - a).map((priority) => groups.get(priority) ?? []);
}

/**
 * takeBest: the best voicings in TuxGuitar's ranking, skipping those that only repeat a better one. The ranking is
 * walked one priority at a time, each group sorted only when reached: a search finds up to MAX_COMBINATIONS voicings
 * and the walk usually stops within the first few groups.
 */
function takeBest(voicings: readonly RankedVoicing[], maximum: number): readonly (readonly StringValue[])[] {
  const best: (readonly StringValue[])[] = [];
  for (const group of priorityGroups(voicings)) {
    for (const { combination } of [...group].sort(byFullness)) {
      if (best.length >= maximum) {
        return best;
      }
      if (!isDuplicate(combination, best)) {
        best.push(combination);
      }
    }
  }
  return best;
}

function toChord(combination: readonly StringValue[], stringCount: number, name: string): Chord {
  // StringValue strings count from the lowest; chord frets from string 1, the highest.
  const frets = Array.from({ length: stringCount }, (_, i) => combination.find((value) => value.string === stringCount - 1 - i)?.fret ?? -1);
  return { name, firstFret: chordFirstFret(frets), frets };
}

/**
 * Voicings of the chord on the tuning (open-string pitches, string 1 first, as `Track.strings`), best first, each a
 * `Chord` named after the spec: every note one of the chord's (or its bass), two strings or more, within reach.
 */
export function buildChordVoicings(spec: ChordSpec, tuning: readonly number[], options: VoicingOptions = {}): readonly Chord[] {
  const normalized = normalizeChordSpec(spec);
  const strings = [...tuning].reverse();
  const context = voicingContext(normalized, strings, options);
  const combinations = combineStrings(potentialNotes(context, Math.max(0, options.minFret ?? 0)), context);
  const voicings = combinations.map((combination, order) => ({ combination, order, priority: Math.round(voicingPriority(combination, context)) }));
  const name = chordName(normalized, options.spelling);
  return takeBest(voicings, options.maxVoicings ?? DEFAULT_MAX_VOICINGS).map((combination) => toChord(combination, strings.length, name));
}
