// A fretted track as the easy-fingering search sees it: its beats with notes in order (steps), and for each note every
// string that plays its pitch — nothing about the note but its string and fret may change.
import { tabFret } from '../edit/banjo';
import type { ScopedTrack } from '../edit/edit-scope';
import { neckFrets } from '../edit/string-placement';
import { trackTuning } from '../edit/tuning-presets';
import { durationTicks } from '../model/defaults';
import type { Note, NoteEffect, Track } from '../model/song';
import { type ChainedNote, type NoteLinks, noteLinks } from './chains';

/** A string a note may take, at the fret that keeps its pitch. */
export interface StringOption {
  readonly string: number;
  readonly fret: number;
  /** The fret as the tab shows it — what the hand reaches (a banjo's short 5th string counts from the main nut); 0 = open. */
  readonly position: number;
}

export interface TimelineNote extends ChainedNote {
  readonly noteIndex: number;
  /** Its step (beat) in the timeline. */
  readonly step: number;
  readonly start: number;
  /** Tick its sound ends: its beat's start plus its voice's length. */
  readonly end: number;
  /** Its chain's id: notes of one chain share a string. */
  readonly chain: number;
  /** True when the scope takes it (its options may still be its own place alone). */
  readonly isInScope: boolean;
  /** Where it may go: its own place first, then other strings; one option = it stays. */
  readonly options: readonly StringOption[];
}

/** A beat with notes: when it starts and its notes' ids, every voice. */
export interface TimelineStep {
  readonly start: number;
  readonly noteIds: readonly number[];
}

export interface Timeline {
  readonly notes: readonly TimelineNote[];
  readonly steps: readonly TimelineStep[];
  /** Each chain's last step, by chain id. */
  readonly chainEnds: ReadonlyMap<number, number>;
  /** The steps the search covers (the scope and a beat either side of a run); first > last when none. */
  readonly first: number;
  readonly last: number;
  /** The neck's last fret above the capo. */
  readonly neck: number;
}

function isOnNeck(tuning: readonly number[], string: number, fret: number, neck: number): boolean {
  return Number.isInteger(fret) && fret >= 0 && tabFret(tuning, string, fret) <= neck;
}

/** A bend, vibrato or slide is played with a finger on the string: never on an open string it did not have. */
function needsFinger(effect: NoteEffect): boolean {
  return effect.bend !== undefined || effect.vibrato || effect.wideVibrato || effect.slides.length > 0;
}

/** Frets the note's grace, trill and tapped harmonic sit at on its string: they move with its fret. */
function effectFrets(effect: NoteEffect): readonly number[] {
  const { grace, trill, harmonic } = effect;
  return [grace?.fret, trill?.fret, harmonic?.type === 'tapped' ? harmonic.data : undefined].flatMap((fret) => (fret === undefined ? [] : [fret]));
}

function canTake(note: Note, tuning: readonly number[], string: number, fret: number, neck: number): boolean {
  if (!isOnNeck(tuning, string, fret, neck) || (fret === 0 && needsFinger(note.effect))) {
    return false;
  }
  const delta = fret - note.fret;
  return effectFrets(note.effect).every((at) => isOnNeck(tuning, string, at + delta, neck));
}

function toOption(tuning: readonly number[], string: number, fret: number): StringOption {
  return { string, fret, position: tabFret(tuning, string, fret) };
}

/** The note's own place, then every other string that plays its pitch on the neck; its own place alone when it stays. */
function optionsFor(note: Note, tuning: readonly number[], neck: number, isInScope: boolean): readonly StringOption[] {
  const own = toOption(tuning, note.string, note.fret);
  const open = tuning[note.string - 1];
  if (!isInScope || open === undefined || note.effect.harmonic?.type === 'natural') {
    return [own];
  }
  const pitch = open + note.fret;
  const others = tuning.flatMap((other, i) => {
    const string = i + 1;
    return string !== note.string && canTake(note, tuning, string, pitch - other, neck) ? [toOption(tuning, string, pitch - other)] : [];
  });
  return [own, ...others];
}

type RawNote = Omit<TimelineNote, 'chain' | 'options'> & { readonly options: readonly StringOption[] };

function collect(track: Track, scoped: ScopedTrack, tuning: readonly number[], neck: number): { readonly notes: RawNote[]; readonly steps: TimelineStep[] } {
  const notes: RawNote[] = [];
  const steps: TimelineStep[] = [];
  track.measures.forEach((measure, measureIndex) =>
    measure.beats.forEach((beat, beatIndex) => {
      const ids: number[] = [];
      beat.voices.forEach((voice, voiceIndex) =>
        voice.notes.forEach((note, noteIndex) => {
          const isInScope = scoped.includes(measureIndex, beatIndex, voiceIndex);
          ids.push(notes.length);
          const end = beat.start + durationTicks(voice.duration);
          notes.push({ measureIndex, beatIndex, voiceIndex, noteIndex, string: note.string, note, step: steps.length, start: beat.start, end, isInScope, options: optionsFor(note, tuning, neck, isInScope) });
        }),
      );
      if (ids.length > 0) {
        steps.push({ start: beat.start, noteIds: ids });
      }
    }),
  );
  return { notes, steps };
}

/** A note's options as its links leave them: its own place alone when a tie or link of it reaches nothing, no barred string. */
function linkedOptions(entry: RawNote, id: number, links: NoteLinks): readonly StringOption[] {
  if (links.loose.has(id)) {
    return entry.options.slice(0, 1);
  }
  const barred = links.barred.get(id);
  return barred === undefined ? entry.options : entry.options.filter((option, index) => index === 0 || !barred.has(option.string));
}

/** A chain's notes keep only the strings every one of them can take; a chain whose notes disagree stays where it is. */
function chainOptions(notes: readonly RawNote[], links: NoteLinks): readonly (readonly StringOption[])[] {
  const { chains } = links;
  const own = notes.map((entry, id) => linkedOptions(entry, id, links));
  const shared = new Map<number, Set<number>>();
  notes.forEach((entry, id) => {
    const chain = chains[id] ?? id;
    const strings = new Set((own[id] ?? []).map((option) => option.string));
    const kept = shared.get(chain);
    shared.set(chain, kept === undefined ? strings : new Set([...kept].filter((string) => strings.has(string))));
  });
  return notes.map((entry, id) => {
    const strings = shared.get(chains[id] ?? id) ?? new Set<number>();
    return strings.has(entry.string) ? (own[id] ?? []).filter((option) => strings.has(option.string)) : entry.options.slice(0, 1);
  });
}

/** Steps the search covers: a whole track's, or a run's steps with one step either side to place the hand. */
function searchedSteps(notes: readonly TimelineNote[], stepCount: number, isWhole: boolean): readonly [number, number] {
  if (isWhole) {
    return [0, stepCount - 1];
  }
  const inScope = notes.filter((note) => note.isInScope).map((note) => note.step);
  return inScope.length === 0 ? [0, -1] : [Math.max(0, Math.min(...inScope) - 1), Math.min(stepCount - 1, Math.max(...inScope) + 1)];
}

/** The timeline of a fretted track for a scope: its steps, each note's chain and the strings it may take. */
export function buildTimeline(track: Track, scoped: ScopedTrack): Timeline {
  const tuning = trackTuning(track);
  const neck = neckFrets(track.offset);
  const { notes: raw, steps } = collect(track, scoped, tuning, neck);
  const links = noteLinks(track, raw);
  const options = chainOptions(raw, links);
  const notes = raw.map((entry, id): TimelineNote => ({ ...entry, chain: links.chains[id] ?? id, options: options[id] ?? entry.options.slice(0, 1) }));
  const chainEnds = new Map<number, number>();
  notes.forEach((note) => chainEnds.set(note.chain, Math.max(chainEnds.get(note.chain) ?? note.step, note.step)));
  const [first, last] = searchedSteps(notes, steps.length, scoped.isWhole);
  return { notes, steps, chainEnds, first, last, neck };
}
