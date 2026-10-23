import { type Chord, DIAGRAM_FRETS, MAX_FRET, type Note, type NoteSpelling, chordFirstFret, recognizeChord } from '@gp-editor/core';
import { diagramFirstFret } from '../score/chord-diagram';

/** The chord being edited in the chord panel's grid (after TuxGuitar's TGChordEditor). */
export interface ChordDraft {
  /** A fret per string, string 1 first; -1 = not played. */
  readonly frets: readonly number[];
  /** The fret the grid starts at. */
  readonly firstFret: number;
  readonly name: string;
  /** Typed by the user: the grid no longer renames the chord. */
  readonly isNameEdited: boolean;
}

/** Highest first fret of the grid (TGChordEditor.MAX_FRET), so its last fret stays on the neck. */
export const MAX_FIRST_FRET = MAX_FRET - DIAGRAM_FRETS + 1;

/** The frets fitted to the track's strings. */
function fitFrets(frets: readonly number[], stringCount: number): readonly number[] {
  return Array.from({ length: stringCount }, (_, i) => frets[i] ?? -1);
}

/** The draft named after its frets, unless the user typed the name. */
function withRecognizedName(draft: ChordDraft, tuning: readonly number[], spelling?: NoteSpelling): ChordDraft {
  return draft.isNameEdited ? draft : { ...draft, name: recognizeChord(draft.frets, tuning, { spelling })[0]?.name ?? '' };
}

/** A chord to edit (the beat's, or one from the library or the song), or an empty grid at the nut. */
export function draftFromChord(chord: Chord | undefined, tuning: readonly number[]): ChordDraft {
  if (chord === undefined) {
    return { frets: fitFrets([], tuning.length), firstFret: 1, name: '', isNameEdited: false };
  }
  const frets = fitFrets(chord.frets, tuning.length);
  return { frets, firstFret: diagramFirstFret({ ...chord, frets }), name: chord.name, isNameEdited: false };
}

/** "Use the notes of the beat": a fret per note's string, named after them (TGChordDialog#findCurrentChord). */
export function draftFromNotes(notes: readonly Note[], tuning: readonly number[], spelling?: NoteSpelling): ChordDraft {
  const frets = Array.from({ length: tuning.length }, (_, i) => notes.find((candidate) => candidate.string === i + 1)?.fret ?? -1);
  return withRecognizedName({ frets, firstFret: chordFirstFret(frets), name: '', isNameEdited: false }, tuning, spelling);
}

/**
 * A click on the grid: on a fret, a finger there (or off, when it was there); above the nut, the string open or not
 * played. The chord is named again from its frets.
 */
export function toggleDraftString(draft: ChordDraft, string: number, fret: number | 'open', tuning: readonly number[], spelling?: NoteSpelling): ChordDraft {
  const index = string - 1;
  const current = draft.frets[index];
  if (current === undefined) {
    return draft;
  }
  const next = fret === 'open' ? (current === 0 ? -1 : 0) : current === fret ? -1 : fret;
  const frets = draft.frets.map((value, i) => (i === index ? next : value));
  return withRecognizedName({ ...draft, frets }, tuning, spelling);
}

/** The grid one or more frets up or down the neck, the fingers moving with it; the same draft at the ends. */
export function shiftDraftWindow(draft: ChordDraft, delta: number, tuning: readonly number[], spelling?: NoteSpelling): ChordDraft {
  const firstFret = Math.min(MAX_FIRST_FRET, Math.max(1, draft.firstFret + delta));
  const moved = firstFret - draft.firstFret;
  if (moved === 0) {
    return draft;
  }
  const frets = draft.frets.map((fret) => (fret > 0 ? fret + moved : fret));
  return withRecognizedName({ ...draft, firstFret, frets }, tuning, spelling);
}

/** The name typed in the name field. */
export function renameDraft(draft: ChordDraft, name: string): ChordDraft {
  return { ...draft, name, isNameEdited: true };
}

/** The chord the draft makes. */
export function draftChord(draft: ChordDraft): Chord {
  return { name: draft.name.trim(), firstFret: draft.firstFret, frets: draft.frets };
}
