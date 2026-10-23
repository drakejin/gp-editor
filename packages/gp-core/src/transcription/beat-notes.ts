import { MAX_FRET } from '../edit/edit-song';
import { sortByString } from '../edit/song-paths';
import { placeNotes } from '../edit/string-placement';
import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import type { Note } from '../model/song';
import { toNoteEffect } from './note-effects';
import { parsePitch } from './pitch';
import type { TranscribedNote } from './types';

const SEMITONES_PER_OCTAVE = 12;
/** Guitar and bass music is written an octave above the sound. */
const WRITTEN_ABOVE_SOUND = SEMITONES_PER_OCTAVE;

/** The neck a track's notes go on. */
export interface Neck {
  /** Open-string MIDI pitches, string 1 (highest) first. */
  readonly tuning: readonly number[];
  readonly capo: number;
  /** Last fret above the capo (neckFrets). */
  readonly lastFret: number;
}

/** A note on the neck, with its pitch counted from the capo (open string + fret), so a tie can find it. */
export interface PlacedNote {
  readonly string: number;
  readonly fret: number;
  readonly pitch: number;
}

/** What one voice plays at a beat, and what it played just before (empty after a rest). */
export interface VoiceAtBeat {
  readonly notes: readonly TranscribedNote[];
  readonly previous: readonly PlacedNote[];
}

/** Notes that did not go on the neck as written, counted for the user. */
export interface PlacementCounts {
  readonly octaveMoved: number;
  /** No free string was left for them. */
  readonly leftOut: number;
  /** Their pitch could not be read (pages that did not go through parseTranscriptionPage). */
  readonly unreadable: number;
}

export const NO_COUNTS: PlacementCounts = { octaveMoved: 0, leftOut: 0, unreadable: 0 };

export function addCounts(a: PlacementCounts, b: PlacementCounts): PlacementCounts {
  return { octaveMoved: a.octaveMoved + b.octaveMoved, leftOut: a.leftOut + b.leftOut, unreadable: a.unreadable + b.unreadable };
}

/** The notes of each voice of a beat (in `voices` order, by string) and where they went. */
export interface BeatNotes {
  readonly notes: readonly (readonly Note[])[];
  readonly placed: readonly (readonly PlacedNote[])[];
  readonly counts: PlacementCounts;
}

/** A note with its string and fret settled: a tab note, or a tied note on the string of the note it continues. */
interface FixedEntry {
  readonly kind: 'fixed';
  readonly voiceIndex: number;
  readonly note: TranscribedNote;
  readonly string: number;
  readonly fret: number;
  readonly isTied: boolean;
}

/** A written note still to be put on a string; `pitch` is counted from the capo. */
interface FreeEntry {
  readonly kind: 'free';
  readonly voiceIndex: number;
  readonly note: TranscribedNote;
  readonly pitch: number;
}

type Entry = FixedEntry | FreeEntry | { readonly kind: 'unreadable' };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function toEntry(note: TranscribedNote, voice: VoiceAtBeat, voiceIndex: number, neck: Neck): Entry {
  if (note.string !== undefined && note.fret !== undefined) {
    const string = clamp(note.string, 1, neck.tuning.length);
    const fret = clamp(note.fret, 0, MAX_FRET);
    const isTied = note.tied === true && voice.previous.some((previous) => previous.string === string && previous.fret === fret);
    return { kind: 'fixed', voiceIndex, note, string, fret, isTied };
  }
  const written = note.pitch === undefined ? undefined : parsePitch(note.pitch);
  if (written === undefined) {
    return { kind: 'unreadable' };
  }
  const pitch = written - WRITTEN_ABOVE_SOUND - neck.capo;
  const continued = note.tied === true ? voice.previous.find((previous) => previous.pitch === pitch) : undefined;
  return continued === undefined
    ? { kind: 'free', voiceIndex, note, pitch }
    : { kind: 'fixed', voiceIndex, note, string: continued.string, fret: continued.fret, isTied: true };
}

/**
 * The string a written note would rather go on: the one whose open pitch is the highest at or below the note, so it
 * gets its lowest fret (a note below every string is first raised by octaves). 1 when there is no string.
 */
export function preferredString(pitch: number, tuning: readonly number[]): number {
  const lowest = Math.min(...tuning);
  const raised = pitch < lowest ? pitch + Math.ceil((lowest - pitch) / SEMITONES_PER_OCTAVE) * SEMITONES_PER_OCTAVE : pitch;
  const best = tuning.reduce<number | undefined>((found, open, index) => {
    const current = found === undefined ? undefined : tuning[found];
    return open <= raised && (current === undefined || open > current) ? index : found;
  }, undefined);
  return (best ?? 0) + 1;
}

/** Fixed notes take their strings in order; a second note for a taken string is left out. */
function claimStrings(entries: readonly FixedEntry[]): { readonly kept: readonly FixedEntry[]; readonly leftOut: number } {
  const taken = new Set<number>();
  const kept = entries.filter((entry) => {
    const isFree = !taken.has(entry.string);
    taken.add(entry.string);
    return isFree;
  });
  return { kept, leftOut: entries.length - kept.length };
}

/** Written notes, highest first, on the strings the fixed notes left free (placeNotes over just those strings). */
function placeFree(entries: readonly FreeEntry[], taken: ReadonlySet<number>, neck: Neck): { readonly placed: readonly FixedEntry[]; readonly counts: PlacementCounts } {
  const strings = neck.tuning.map((_, index) => index + 1).filter((string) => !taken.has(string));
  const tuning = strings.map((string) => neck.tuning[string - 1] ?? 0);
  const ordered = [...entries].sort((a, b) => b.pitch - a.pitch);
  const placements = placeNotes(ordered.map((entry) => ({ pitch: entry.pitch, preferredString: preferredString(entry.pitch, tuning) })), tuning, neck.lastFret);
  const placed = ordered.flatMap((entry, index): FixedEntry[] => {
    const placement = placements[index];
    const string = placement === undefined ? undefined : strings[placement.string - 1];
    return placement === undefined || string === undefined ? [] : [{ ...entry, kind: 'fixed', string, fret: placement.fret, isTied: false }];
  });
  const octaveMoved = placements.filter((placement) => placement !== undefined && placement.octaves !== 0).length;
  return { placed, counts: { octaveMoved, leftOut: entries.length - placed.length, unreadable: 0 } };
}

function toNote(entry: FixedEntry): Note {
  const effect = toNoteEffect(entry.note.effects);
  return { fret: entry.fret, velocity: DEFAULT_VELOCITY, string: entry.string, isTied: entry.isTied && !effect.deadNote, effect };
}

/**
 * Puts the notes every voice plays at one beat on the track's strings. Tab notes keep their string (clamped to the
 * track's strings) and fret; a tied written note keeps the string and fret of the note of the same pitch it continues;
 * the other written notes sound an octave below their written pitch and go on the strings left, each preferring the
 * string that holds it lowest (preferredString), moved by octaves when no string holds them. One note per string: what
 * does not fit is left out. A tie is kept only when the voice's previous event has the note it continues (same string
 * and fret for a tab note, same pitch for a written one).
 */
export function buildBeatNotes(voices: readonly VoiceAtBeat[], neck: Neck): BeatNotes {
  const entries = voices.flatMap((voice, voiceIndex) => voice.notes.map((note) => toEntry(note, voice, voiceIndex, neck)));
  const fixed = claimStrings(entries.filter((entry): entry is FixedEntry => entry.kind === 'fixed'));
  const free = placeFree(
    entries.filter((entry): entry is FreeEntry => entry.kind === 'free'),
    new Set(fixed.kept.map((entry) => entry.string)),
    neck,
  );
  const all = [...fixed.kept, ...free.placed];
  const unreadable = entries.filter((entry) => entry.kind === 'unreadable').length;
  return {
    notes: voices.map((_, voiceIndex) => sortByString(all.filter((entry) => entry.voiceIndex === voiceIndex).map(toNote))),
    placed: voices.map((_, voiceIndex) =>
      all.filter((entry) => entry.voiceIndex === voiceIndex).map((entry) => ({ string: entry.string, fret: entry.fret, pitch: (neck.tuning[entry.string - 1] ?? 0) + entry.fret })),
    ),
    counts: addCounts(free.counts, { octaveMoved: 0, leftOut: fixed.leftOut, unreadable }),
  };
}
