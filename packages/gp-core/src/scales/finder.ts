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
}

/** Matches findScales lists unless asked for another number. */
export const MAX_SCALE_MATCHES = 40;

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
 * first: those the notes fill most (fewest unused notes), then those whose root is played most, then the list's order
 * (common scales first). The same notes on the same root are listed once, the other names as aliases.
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
  const ranked = [...groups.values()].flatMap(([first, ...others]): RankedGroup[] =>
    first === undefined ? [] : [{ first, others, unusedNotes: first.noteCount - usedCount, rootShare: (counts[first.pitchClass] ?? 0) / total }],
  );
  // Only the matches listed are spelled (preferredScaleChoice tries the root's names).
  return ranked
    .sort(compareGroups)
    .slice(0, Math.max(0, limit))
    .map(({ first, others, unusedNotes, rootShare }) => ({
      choice: preferredScaleChoice(first.pitchClass, first.scaleIndex),
      unusedNotes,
      rootShare,
      aliases: others.map((other) => SCALES[other.scaleIndex]?.name ?? ''),
    }));
}

/** The scales with the same notes on the same root, the first in the list's order leading. */
interface RankedGroup {
  readonly first: Candidate;
  readonly others: readonly Candidate[];
  readonly unusedNotes: number;
  readonly rootShare: number;
}

function compareGroups(a: RankedGroup, b: RankedGroup): number {
  return a.unusedNotes - b.unusedNotes || b.rootShare - a.rootShare || a.first.scaleIndex - b.first.scaleIndex || a.first.pitchClass - b.first.pitchClass;
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
