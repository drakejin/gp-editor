// One beat's moving notes onto the strings the other notes leave free, after TuxGuitar's
// TGMeasureManager.transposeNote ("try to keep the string", else the next string that holds the new pitch). Unlike
// TuxGuitar, which removes a note it cannot place, such a note stays as it was and keeps its string.
import { type NoteToPlace, type StringPlacement, placeNotes } from './string-placement';

/** A note that moves: its new pitch counted from the capo, the string it would rather take, and the string it is on. */
export interface NoteToMove extends NoteToPlace {
  readonly string: number;
}

/** Position (1-based) in `free` of the free string nearest to `preferred`; the higher string on a tie. */
function nearestFree(preferred: number, free: readonly number[]): number {
  return free.reduce((best, string, i) => (Math.abs(string - preferred) < Math.abs((free[best - 1] ?? 0) - preferred) ? i + 1 : best), 1);
}

/** placeNotes on the free strings only; a note that would need an octave move or has no string gets undefined. */
function placeOnFree(notes: readonly NoteToMove[], tuning: readonly number[], neck: number, free: readonly number[]): readonly (StringPlacement | undefined)[] {
  const freeTuning = free.map((string) => tuning[string - 1] ?? 0);
  const toPlace = notes.map((note) => ({ pitch: note.pitch, preferredString: nearestFree(note.preferredString, free) }));
  return placeNotes(toPlace, freeTuning, neck).map((placement) =>
    placement === undefined || placement.octaves !== 0 ? undefined : { ...placement, string: free[placement.string - 1] ?? placement.string },
  );
}

function placeAround(
  notes: readonly NoteToMove[],
  tuning: readonly number[],
  neck: number,
  taken: ReadonlySet<number>,
  stuck: ReadonlySet<number>,
): readonly (StringPlacement | undefined)[] {
  const blocked = new Set([...taken, ...[...stuck].map((noteIndex) => notes[noteIndex]?.string ?? 0)]);
  const free = tuning.map((_, i) => i + 1).filter((string) => !blocked.has(string));
  const moving = notes.flatMap((_, noteIndex) => (stuck.has(noteIndex) ? [] : [noteIndex]));
  const placed = placeOnFree(moving.flatMap((noteIndex) => notes[noteIndex] ?? []), tuning, neck, free);
  const newlyStuck = moving.filter((_, k) => placed[k] === undefined);
  if (newlyStuck.length > 0) {
    return placeAround(notes, tuning, neck, taken, new Set([...stuck, ...newlyStuck]));
  }
  return notes.map((_, noteIndex) => placed[moving.indexOf(noteIndex)]);
}

/**
 * Puts the moving notes of one beat (all voices) at their new pitches on frets 0…neck of the strings not `taken` by the
 * notes that stay: each on its preferred string when it fits there, else the nearest free string, earlier notes keeping
 * their preferred string first. A note no free string holds gets undefined: it stays as it was, on its own string, and
 * the others are placed again around it.
 */
export function placeMovingNotes(notes: readonly NoteToMove[], tuning: readonly number[], neck: number, taken: ReadonlySet<number>): readonly (StringPlacement | undefined)[] {
  return placeOnOwnStrings(notes, tuning, neck, taken) ?? placeAround(notes, tuning, neck, taken, new Set());
}

/**
 * The common case, where placeAround comes to the same: every note's preferred string is free, no two share one, and
 * the new pitch is on that string's neck — each note stays on it. Undefined otherwise.
 */
function placeOnOwnStrings(notes: readonly NoteToMove[], tuning: readonly number[], neck: number, taken: ReadonlySet<number>): StringPlacement[] | undefined {
  const used = new Set<number>(taken);
  const placed: StringPlacement[] = [];
  for (const { pitch, preferredString: string } of notes) {
    const fret = pitch - (tuning[string - 1] ?? Number.NaN);
    if (!Number.isInteger(string) || used.has(string) || !(fret >= 0 && fret <= neck)) {
      return undefined;
    }
    used.add(string);
    placed.push({ string, fret, octaves: 0 });
  }
  return placed;
}
