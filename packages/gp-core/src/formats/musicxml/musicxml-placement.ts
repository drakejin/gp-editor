// The notes of one beat on the track's strings (no TuxGuitar reader exists): tab positions kept, written pitches placed by edit/string-placement.
import { MAX_FRET } from '../../edit/edit-song';
import { placeNotes } from '../../edit/string-placement';
import type { Grace, Note } from '../../model/song';
import { preferredString } from '../../transcription/beat-notes';
import { toNoteEffect } from './musicxml-effects';
import type { RawNote } from './musicxml-note';
import type { VoiceEventDraft } from './musicxml-voices';

/** The neck a track's notes go on. */
export interface Neck {
  /** Open-string MIDI pitches, string 1 (highest) first. */
  readonly tuning: readonly number[];
  readonly capo: number;
  /** Last fret above the capo (neckFrets). */
  readonly lastFret: number;
  readonly isPercussion: boolean;
  /** A drum note's key (its instrument's MIDI key, else its pitch). */
  readonly keyOf: (note: RawNote) => number | undefined;
  readonly velocityOf: (note: RawNote) => number;
}

/** A note on the neck: `pitch` is counted from the capo (open string + fret), so a tie can find it. */
export interface PlacedNote {
  readonly string: number;
  readonly fret: number;
  readonly pitch: number;
}

/** What every voice plays at the beat (undefined: nothing starts there) and what each played before. */
export interface BeatVoices {
  readonly events: readonly (VoiceEventDraft | undefined)[];
  readonly previous: readonly (readonly PlacedNote[])[];
}

interface Entry {
  readonly voiceIndex: number;
  readonly note: RawNote;
  readonly string?: number;
  readonly fret?: number;
  readonly pitch?: number;
  readonly isTied: boolean;
}

interface FixedEntry extends Entry {
  readonly string: number;
  readonly fret: number;
}

function isFixed(entry: Entry): entry is FixedEntry {
  return entry.string !== undefined && entry.fret !== undefined;
}

/** A tab note keeps its string, fret and tie; a tied written note goes where the note of its pitch before it is. */
function toEntry(note: RawNote, voiceIndex: number, previous: readonly PlacedNote[], neck: Neck): Entry | undefined {
  const tab = note.tab;
  if (tab !== undefined && tab.string <= neck.tuning.length) {
    return { voiceIndex, note, string: tab.string, fret: tab.fret, isTied: note.isTieStop };
  }
  if (note.pitch === undefined) {
    return undefined;
  }
  const pitch = note.pitch - neck.capo;
  const continued = note.isTieStop ? previous.find((placed) => placed.pitch === pitch) : undefined;
  return continued === undefined
    ? { voiceIndex, note, pitch, isTied: false }
    : { voiceIndex, note, string: continued.string, fret: continued.fret, isTied: true };
}

/** Fixed notes take their strings in order; a second note for a taken string is left out. */
function claimStrings(entries: readonly FixedEntry[]): FixedEntry[] {
  const taken = new Set<number>();
  return entries.filter((entry) => {
    const isFree = !taken.has(entry.string);
    taken.add(entry.string);
    return isFree;
  });
}

/** Written notes, highest first, on the strings left free (placeNotes over just those strings). */
function placeFree(entries: readonly Entry[], taken: ReadonlySet<number>, neck: Neck): FixedEntry[] {
  const strings = neck.tuning.map((_, index) => index + 1).filter((string) => !taken.has(string));
  const tuning = strings.map((string) => neck.tuning[string - 1] ?? 0);
  const ordered = [...entries].sort((a, b) => (b.pitch ?? 0) - (a.pitch ?? 0));
  const placements = placeNotes(ordered.map((entry) => ({ pitch: entry.pitch ?? 0, preferredString: preferredString(entry.pitch ?? 0, tuning) })), tuning, neck.lastFret);
  return ordered.flatMap((entry, index): FixedEntry[] => {
    const placement = placements[index];
    const string = placement === undefined ? undefined : strings[placement.string - 1];
    return placement === undefined || string === undefined ? [] : [{ ...entry, string, fret: placement.fret }];
  });
}

/** Drum notes go on the strings in order, the fret holding the key. */
function placeDrums(voices: BeatVoices, neck: Neck): FixedEntry[] {
  const notes = voices.events.flatMap((event, voiceIndex) => (event?.notes ?? []).map((note) => ({ note, voiceIndex })));
  return notes
    .flatMap(({ note, voiceIndex }) => {
      const key = neck.keyOf(note);
      return key === undefined ? [] : [{ voiceIndex, note, fret: key, isTied: false }];
    })
    .slice(0, neck.tuning.length)
    .map((entry, index) => ({ ...entry, string: index + 1 }));
}

function placeEntries(voices: BeatVoices, neck: Neck): FixedEntry[] {
  if (neck.isPercussion) {
    return placeDrums(voices, neck);
  }
  const entries = voices.events.flatMap((event, voiceIndex) =>
    (event?.notes ?? []).flatMap((note) => toEntry(note, voiceIndex, voices.previous[voiceIndex] ?? [], neck) ?? []),
  );
  const fixed = claimStrings(entries.filter(isFixed));
  const free = placeFree(entries.filter((entry) => !isFixed(entry)), new Set(fixed.map((entry) => entry.string)), neck);
  return [...fixed, ...free];
}

/** The fret a grace note takes on its main note's string; undefined when it is not on the neck there. */
function graceFret(grace: RawNote, target: Note, neck: Neck): number | undefined {
  if (neck.isPercussion) {
    return neck.keyOf(grace);
  }
  if (grace.tab !== undefined && grace.tab.string === target.string) {
    return grace.tab.fret;
  }
  const fret = grace.pitch === undefined ? undefined : grace.pitch - neck.capo - (neck.tuning[target.string - 1] ?? 0);
  return fret !== undefined && fret >= 0 && fret <= MAX_FRET ? fret : undefined;
}

function toGrace(grace: RawNote, fret: number, velocity: number): Grace {
  const { marks } = grace;
  const transition = marks.isLegatoStart || marks.isSlurStart ? 'hammer' : marks.isSlideStart ? 'slide' : 'none';
  return { fret, duration: grace.grace?.value ?? 3, velocity, transition, onBeat: grace.grace?.isSlash !== true, isDead: marks.isDead };
}

/** The note a grace note leads into: the one on its tab string, else the one nearest its pitch; only notes without a grace. */
function graceTarget(notes: readonly Note[], grace: RawNote, neck: Neck): number | undefined {
  const pitchOf = (note: Note): number => (neck.tuning[note.string - 1] ?? 0) + note.fret + neck.capo;
  const distance = (note: Note): number => Math.abs(pitchOf(note) - (grace.pitch ?? 0));
  const free = notes.map((note, index) => ({ note, index })).filter(({ note }) => note.effect.grace === undefined);
  if (grace.tab !== undefined) {
    return free.find(({ note }) => note.string === grace.tab?.string)?.index;
  }
  return free.reduce<{ readonly note: Note; readonly index: number } | undefined>((best, candidate) => (best === undefined || distance(candidate.note) < distance(best.note) ? candidate : best), undefined)?.index;
}

/** The notes with the event's grace notes attached; a grace note that fits no note is left out. */
function withGraces(notes: readonly Note[], graces: readonly RawNote[], neck: Neck): readonly Note[] {
  return graces.reduce<readonly Note[]>((current, grace) => {
    const index = graceTarget(current, grace, neck);
    const target = index === undefined ? undefined : current[index];
    const fret = target === undefined ? undefined : graceFret(grace, target, neck);
    if (target === undefined || fret === undefined) {
      return current;
    }
    const graced: Note = { ...target, effect: { ...target.effect, grace: toGrace(grace, fret, target.velocity) } };
    return current.map((note, noteIndex) => (noteIndex === index ? graced : note));
  }, notes);
}

function toNote(entry: FixedEntry, event: VoiceEventDraft, neck: Neck): Note {
  const effect = toNoteEffect(entry.note.marks, entry.fret, event.duration.value, neck.isPercussion);
  return { fret: entry.fret, velocity: neck.velocityOf(entry.note), string: entry.string, isTied: entry.isTied && !effect.deadNote, effect };
}

/** The notes every voice plays at one beat, by voice (strings in order), and where they went (for the next beat's ties). */
export function placeBeat(voices: BeatVoices, neck: Neck): { readonly notes: readonly (readonly Note[])[]; readonly placed: readonly (readonly PlacedNote[])[] } {
  const entries = placeEntries(voices, neck);
  const notes = voices.events.map((event, voiceIndex) => {
    if (event === undefined) {
      return [];
    }
    const own = entries.filter((entry) => entry.voiceIndex === voiceIndex).map((entry) => toNote(entry, event, neck));
    return [...withGraces(own, event.graces, neck)].sort((a, b) => a.string - b.string);
  });
  const placed = notes.map((voiceNotes) => voiceNotes.map((note) => ({ string: note.string, fret: note.fret, pitch: (neck.tuning[note.string - 1] ?? 0) + note.fret })));
  return { notes, placed };
}
