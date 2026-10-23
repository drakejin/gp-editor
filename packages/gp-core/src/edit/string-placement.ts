import { tabFret } from './banjo';
import { NECK_FRETS } from './edit-song';

const SEMITONES_PER_OCTAVE = 12;

/** A note to put on a string: its pitch counted from the capo (open string + fret) and the string it would rather keep. */
export interface NoteToPlace {
  readonly pitch: number;
  /** 1 = highest string of the new tuning. */
  readonly preferredString: number;
}

/** Where a note went. `octaves` is how far its pitch moved (0 = same pitch, 1 = an octave up). */
export interface StringPlacement {
  readonly string: number;
  readonly fret: number;
  readonly octaves: number;
}

/** Last fret of the neck (NECK_FRETS) above a capo at `offset`: frets are counted from the capo. */
export function neckFrets(offset: number): number {
  return Math.max(0, NECK_FRETS - offset);
}

/**
 * For each string of `from` (index 0 = string 1), the string of `to` its notes would rather keep: the same string when
 * both tunings have as many strings, else the string whose open pitch is closest (TuxGuitar's
 * TGTrackManager.allocateNotesToClosestString), so a 7-string's low A goes to the low E of a 6-string.
 */
export function homeStrings(from: readonly number[], to: readonly number[]): readonly number[] {
  if (from.length === to.length) {
    return from.map((_, i) => i + 1);
  }
  return from.map((open) =>
    to.reduce((best, candidate, i) => (Math.abs(candidate - open) < Math.abs((to[best - 1] ?? 0) - open) ? i + 1 : best), 1),
  );
}

/** Strings 1…count, nearest to `preferred` first (the higher string first on a tie). */
function stringsByPreference(preferred: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
}

function fretOf(pitch: number, tuning: readonly number[], string: number): number {
  return pitch - (tuning[string - 1] ?? Number.POSITIVE_INFINITY);
}

function fitsFrets(pitch: number, tuning: readonly number[], string: number, lastFret: number): boolean {
  const fret = fretOf(pitch, tuning, string);
  return fret >= 0 && fret <= lastFret;
}

/** Kuhn's augmenting path: gives the note a free string, else frees one by moving its holder. Updates `owners`. */
function augment(noteIndex: number, options: readonly (readonly number[])[], owners: (number | undefined)[], visited: Set<number>): boolean {
  const candidates = options[noteIndex] ?? [];
  const free = candidates.find((string) => owners[string - 1] === undefined);
  if (free !== undefined) {
    owners[free - 1] = noteIndex;
    return true;
  }
  for (const string of candidates) {
    const holder = owners[string - 1];
    if (!visited.has(string) && holder !== undefined) {
      visited.add(string);
      if (augment(holder, options, owners, visited)) {
        owners[string - 1] = noteIndex;
        return true;
      }
    }
  }
  return false;
}

/**
 * Note index on each string (index 0 = string 1): as many notes as possible on frets 0…neck. Notes first take their
 * preferred string in list order; the others go to the nearest free string, moving earlier notes only when that is the
 * only way to fit them (a maximum matching, so a beat that can be played on the neck always is).
 */
function matchOnNeck(notes: readonly NoteToPlace[], tuning: readonly number[], neck: number): readonly (number | undefined)[] {
  const options = notes.map((note) =>
    stringsByPreference(note.preferredString, tuning.length).filter((string) => fitsFrets(note.pitch, tuning, string, neck)),
  );
  const owners: (number | undefined)[] = tuning.map(() => undefined);
  notes.forEach((note, noteIndex) => {
    if (options[noteIndex]?.[0] === note.preferredString && owners[note.preferredString - 1] === undefined) {
      owners[note.preferredString - 1] = noteIndex;
    }
  });
  notes.forEach((_, noteIndex) => {
    if (!owners.includes(noteIndex)) {
      augment(noteIndex, options, owners, new Set());
    }
  });
  return owners;
}

/** The fewest octaves that bring `pitch` onto frets 0…neck of an open string; undefined when none does. */
function octavesOnto(pitch: number, open: number, neck: number): number | undefined {
  const fret = pitch - open;
  const octaves = fret < 0 ? Math.ceil(-fret / SEMITONES_PER_OCTAVE) : -Math.ceil(Math.max(0, fret - neck) / SEMITONES_PER_OCTAVE);
  const moved = fret + octaves * SEMITONES_PER_OCTAVE;
  return moved >= 0 && moved <= neck ? octaves + 0 : undefined;
}

function placement(pitch: number, tuning: readonly number[], string: number, octaves: number): StringPlacement {
  return { string, fret: fretOf(pitch + octaves * SEMITONES_PER_OCTAVE, tuning, string), octaves };
}

/** A note the neck could not hold: moved by the fewest octaves onto a free string's neck. */
function placeLeftover(note: NoteToPlace, tuning: readonly number[], neck: number, free: ReadonlySet<number>): StringPlacement | undefined {
  const strings = stringsByPreference(note.preferredString, tuning.length).filter((string) => free.has(string));
  let best: StringPlacement | undefined;
  for (const string of strings) {
    const octaves = octavesOnto(note.pitch, tuning[string - 1] ?? 0, neck);
    if (octaves !== undefined && (best === undefined || Math.abs(octaves) < Math.abs(best.octaves))) {
      best = placement(note.pitch, tuning, string, octaves);
    }
  }
  return best;
}

/**
 * Puts the notes of one beat (all voices) on separate strings of `tuning`, keeping each pitch where it can:
 * 1. on the neck (frets 0…neck): each note on its preferred string, else the nearest free string — earlier notes keep
 *    their preferred string, and as many notes as possible fit;
 * 2. a note that does not fit is moved by the fewest octaves onto a free string's neck (never past the neck, so what a
 *    retune makes always fits the tuning it was made for).
 * undefined for a note left without a string (more notes than strings).
 */
export function placeNotes(notes: readonly NoteToPlace[], tuning: readonly number[], neck: number): readonly (StringPlacement | undefined)[] {
  const owners = matchOnNeck(notes, tuning, neck);
  const placed = notes.map((note, noteIndex): StringPlacement | undefined => {
    const string = owners.indexOf(noteIndex) + 1;
    return string > 0 ? placement(note.pitch, tuning, string, 0) : undefined;
  });
  const free = new Set(tuning.map((_, i) => i + 1).filter((string) => owners[string - 1] === undefined));
  return placed.map((existing, noteIndex) => {
    const note = notes[noteIndex];
    if (existing !== undefined || note === undefined) {
      return existing;
    }
    const leftover = placeLeftover(note, tuning, neck, free);
    if (leftover !== undefined) {
      free.delete(leftover.string);
    }
    return leftover;
  });
}

/** Frets the fretting hand covers without moving: one per finger, from the index finger's fret. */
export const HAND_SPAN = 4;

/** How far the hand (index finger at `handFret`, first position at least) must reach for a fret, as the tab counts it. */
function handDistance(neckFret: number, handFret: number): number {
  const index = Math.max(1, handFret);
  if (neckFret === 0) {
    return index - 1;
  }
  return neckFret < index ? index - neckFret : Math.max(0, neckFret - (index + HAND_SPAN - 1));
}

/** The string nearest the hand among `strings` that play `pitch` on the neck; undefined when none does. */
function nearestToHand(pitch: number, strings: readonly number[], tuning: readonly number[], handFret: number, neck: number): number | undefined {
  let best: { readonly string: number; readonly distance: number } | undefined;
  for (const string of strings) {
    const fret = fretOf(pitch, tuning, string);
    const distance = handDistance(tabFret(tuning, string, fret), handFret);
    if (fitsFrets(pitch, tuning, string, neck) && (best === undefined || distance < best.distance)) {
      best = { string, distance };
    }
  }
  return best?.string;
}

/**
 * Preferred strings (in input order) for notes played together with the fretting hand at `handFret`: from the highest
 * pitch down, each takes the string nearest the hand among the free strings below the one the higher note took — so a
 * chord keeps its pitch order across the strings —, else among any free string, else string 1 (placeNotes then finds
 * it a place). `taken` strings are left alone.
 */
export function stringsNearHand(pitches: readonly number[], tuning: readonly number[], handFret: number, neck: number, taken: readonly number[] = []): readonly number[] {
  const order = pitches.map((pitch, index) => ({ pitch, index })).sort((a, b) => b.pitch - a.pitch);
  const used = new Set(taken);
  const preferred: number[] = pitches.map(() => 1);
  let lastString = 0;
  for (const { pitch, index } of order) {
    const free = tuning.map((_, i) => i + 1).filter((string) => !used.has(string));
    const string = nearestToHand(pitch, free.filter((candidate) => candidate > lastString), tuning, handFret, neck) ?? nearestToHand(pitch, free, tuning, handFret, neck);
    if (string !== undefined) {
      used.add(string);
      preferred[index] = string;
      lastString = Math.max(lastString, string);
    }
  }
  return preferred;
}

/** Where step entry puts notes played together: placeNotes with the strings nearest the hand preferred (stringsNearHand). */
export function placePitchesNearHand(pitches: readonly number[], tuning: readonly number[], handFret: number, neck: number): readonly (StringPlacement | undefined)[] {
  const preferred = stringsNearHand(pitches, tuning, handFret, neck);
  return placeNotes(pitches.map((pitch, i) => ({ pitch, preferredString: preferred[i] ?? 1 })), tuning, neck);
}
