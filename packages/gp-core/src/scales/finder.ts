// Scale finder: which of TuxGuitar's scales (ScaleManager's list) hold a set of notes. Not in TuxGuitar.
import type { BeatAddress } from '../edit/addresses';
import type { Track } from '../model/song';
import { type ScaleChoice, toPitchClass } from './notes';
import { preferredScaleChoice } from './spelling';
import { SCALES } from './table';

/** A scale that holds every given note. */
export interface ScaleMatch {
  readonly choice: ScaleChoice;
  /** Notes of the scale the given notes do not use: 0 = they fill it. */
  readonly unusedNotes: number;
  /** The share of the given notes that are the root, 0–1. */
  readonly rootShare: number;
  /** Other names in the list for the same notes on the same root ("Ionian Mode" for "Major Scale"). */
  readonly aliases: readonly string[];
  /** A scale, mode or arpeggio of everyday use (COMMON_SCALE_NAMES): these come first. */
  readonly isCommon: boolean;
}

/** Matches findScales lists unless asked for another number. */
export const MAX_SCALE_MATCHES = 40;

/** What an unused scale note costs a match, against the share of the notes on its root (a tenth of them). */
const UNUSED_NOTE_WEIGHT = 0.1;

/** The scales, church modes and triad / seventh arpeggios guitarists use most; the finder lists them first. */
const COMMON_SCALE_NAMES: ReadonlySet<string> = new Set([
  'Major Scale',
  'Pentatonic Major Scale',
  'Blues Major Scale',
  'Minor Scale',
  'Melodic Minor Scale',
  'Harmonic Minor Scale',
  'Pentatonic Minor Scale',
  'Blues Minor Scale',
  'Be-Bop Scale',
  'Whole-Half Scale',
  'Half-Whole Scale',
  'Whole Tone Scale',
  'Dorian Mode',
  'Phrygian Mode',
  'Lydian Mode',
  'Mixolydian Mode',
  'Locrian Mode',
  'Major Arpeggio',
  'Minor Arpeggio',
  'Major 7th Major Arpeggio',
  'Major 7th Minor Arpeggio',
  'Minor 7th Major Arpeggio',
  'Minor 7th Minor Arpeggio',
  'Augmented Arpeggio',
  'Diminished Arpeggio',
]);

function isCommonScale(scaleIndex: number): boolean {
  return COMMON_SCALE_NAMES.has(SCALES[scaleIndex]?.name ?? '');
}

interface Candidate {
  readonly pitchClass: number;
  readonly scaleIndex: number;
  readonly mask: number;
  readonly noteCount: number;
}

/** Every scale on every root, as a 12-bit set of pitch classes (bit 0 = C). */
const CANDIDATES: readonly Candidate[] = SCALES.flatMap((definition, scaleIndex) =>
  Array.from({ length: 12 }, (_, pitchClass) => ({
    pitchClass,
    scaleIndex,
    mask: definition.intervals.reduce((mask, interval) => mask | (1 << ((pitchClass + interval) % 12)), 0),
    noteCount: definition.intervals.length,
  })),
);

/** How often each pitch class is played: index = pitch class. */
function pitchClassCounts(pitches: readonly number[]): readonly number[] {
  const playable = pitches.filter((pitch) => Number.isInteger(pitch));
  return Array.from({ length: 12 }, (_, pitchClass) => playable.filter((pitch) => toPitchClass(pitch) === pitchClass).length);
}

/**
 * The scales and keys that hold every one of the notes (MIDI pitches; a note played more often weighs more), best
 * first: the common scales, modes and arpeggios before the others, and in each those whose root is played most and
 * that leave fewest of their notes unused (each unused note weighs a tenth of the notes), then the list's order. The
 * same notes on the same root are listed once, the other names as aliases.
 */
export function findScales(pitches: readonly number[], limit = MAX_SCALE_MATCHES): readonly ScaleMatch[] {
  const counts = pitchClassCounts(pitches);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return [];
  }
  const used = counts.reduce((mask, count, pitchClass) => (count > 0 ? mask | (1 << pitchClass) : mask), 0);
  const usedCount = counts.filter((count) => count > 0).length;
  const fitting = CANDIDATES.filter((candidate) => (used & ~candidate.mask) === 0);
  const groups = new Map<string, Candidate[]>();
  fitting.forEach((candidate) => {
    const key = `${candidate.pitchClass}:${candidate.mask}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  });
  const ranked = [...groups.values()].flatMap(([first, ...others]): RankedGroup[] => {
    if (first === undefined) {
      return [];
    }
    const isCommon = [first, ...others].some((candidate) => isCommonScale(candidate.scaleIndex));
    return [{ first, others, isCommon, unusedNotes: first.noteCount - usedCount, rootShare: (counts[first.pitchClass] ?? 0) / total }];
  });
  // Only the matches listed are spelled (preferredScaleChoice tries the root's names).
  return ranked
    .sort(compareGroups)
    .slice(0, Math.max(0, limit))
    .map(({ first, others, isCommon, unusedNotes, rootShare }) => ({
      choice: preferredScaleChoice(first.pitchClass, first.scaleIndex),
      unusedNotes,
      rootShare,
      aliases: others.map((other) => SCALES[other.scaleIndex]?.name ?? ''),
      isCommon,
    }));
}

/** The scales with the same notes on the same root, the first in the list's order leading. */
interface RankedGroup {
  readonly first: Candidate;
  readonly others: readonly Candidate[];
  readonly isCommon: boolean;
  readonly unusedNotes: number;
  readonly rootShare: number;
}

/** How well a scale fits: much of the playing on its root, few of its notes unused. */
function fit(group: RankedGroup): number {
  return group.rootShare - group.unusedNotes * UNUSED_NOTE_WEIGHT;
}

function compareGroups(a: RankedGroup, b: RankedGroup): number {
  return Number(b.isCommon) - Number(a.isCommon) || fit(b) - fit(a) || a.first.scaleIndex - b.first.scaleIndex || a.first.pitchClass - b.first.pitchClass;
}

type BeatPlace = Pick<BeatAddress, 'measureIndex' | 'beatIndex'>;

function isBefore(a: BeatPlace, b: BeatPlace): boolean {
  return a.measureIndex < b.measureIndex || (a.measureIndex === b.measureIndex && a.beatIndex < b.beatIndex);
}

/**
 * The sounding pitches of the track's notes, every voice, in order: the open string plus the capo plus the fret. Dead
 * notes and drum tracks have none. With `first` and `last`, only the beats between them (both included, either order).
 */
export function trackPitches(track: Track, first?: BeatPlace, last?: BeatPlace): readonly number[] {
  if (track.isPercussion) {
    return [];
  }
  const [from, to] = first === undefined || last === undefined ? [undefined, undefined] : isBefore(last, first) ? [last, first] : [first, last];
  return track.measures.flatMap((measure, measureIndex) =>
    measure.beats.flatMap((beat, beatIndex) => {
      const place = { measureIndex, beatIndex };
      if ((from !== undefined && isBefore(place, from)) || (to !== undefined && isBefore(to, place))) {
        return [];
      }
      return beat.voices.flatMap((voice) =>
        voice.notes.flatMap((note) => {
          const tuning = track.strings[note.string - 1]?.tuning;
          return tuning === undefined || note.effect.deadNote ? [] : [tuning + track.offset + note.fret];
        }),
      );
    }),
  );
}
