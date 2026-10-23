// Which staves of a MusicXML part become the track's beats (no TuxGuitar reader exists): a notation staff paired with a tab staff gives its notes once.
import type { Clef } from '../../model/song';
import type { ClefKind, PartMeasure, StaffTuning } from './musicxml-measures';
import type { RawNote } from './musicxml-note';

/** How a part's staves are read. */
export interface PartLayout {
  /** Staves whose notes become the track's beats. */
  readonly staves: ReadonlySet<number>;
  /** A tab staff whose notes give the strings and frets of the first notation staff's notes (TuxGuitar writes both). */
  readonly pairedTab?: { readonly notation: number; readonly tab: number };
  readonly tuning?: StaffTuning;
  readonly clef: ClefKind | undefined;
}

function firstClefs(measures: readonly PartMeasure[]): ReadonlyMap<number, ClefKind> {
  const clefs = new Map<number, ClefKind>();
  for (const measure of measures) {
    for (const [staff, clef] of measure.clefs) {
      if (!clefs.has(staff)) {
        clefs.set(staff, clef);
      }
    }
  }
  return clefs;
}

function stavesWithNotes(measures: readonly PartMeasure[]): readonly number[] {
  const staves = new Set<number>();
  measures.forEach((measure) => measure.notes.forEach((note) => staves.add(note.staff)));
  return [...staves].sort((a, b) => a - b);
}

/** The part's staves: a tab staff next to notation staves is read for strings and frets only. */
export function resolveLayout(measures: readonly PartMeasure[]): PartLayout {
  const clefs = firstClefs(measures);
  const used = stavesWithNotes(measures);
  const tabs = used.filter((staff) => clefs.get(staff) === 'tab');
  const notation = used.filter((staff) => clefs.get(staff) !== 'tab');
  const tunings = measures.flatMap((measure) => measure.tunings);
  const [firstTab] = tabs;
  const [firstNotation] = notation;
  const tuning = tunings.find((candidate) => candidate.staff === firstTab) ?? tunings[0];
  if (firstTab !== undefined && firstNotation !== undefined) {
    return { staves: new Set(notation), pairedTab: { notation: firstNotation, tab: firstTab }, tuning, clef: clefs.get(firstNotation) };
  }
  const staves = used.length === 0 ? [1] : used;
  return { staves: new Set(staves), tuning, clef: clefs.get(staves[0] ?? 1) };
}

/** The model's clef for a staff's clef (a tab staff shows the treble clef's notes, percussion the neutral clef). */
export function toModelClef(clef: ClefKind | undefined): Clef {
  if (clef === 'percussion') {
    return 'neutral';
  }
  return clef === undefined || clef === 'tab' ? 'treble' : clef;
}

/** A note's place among the notes that start with it on its staff, grace notes counted apart. */
function pairingKey(note: RawNote, ordinal: number): string {
  return `${note.tick}|${note.grace === undefined ? 'n' : 'g'}|${ordinal}`;
}

function keyed(notes: readonly RawNote[]): readonly (readonly [string, RawNote])[] {
  const counts = new Map<string, number>();
  return notes.flatMap((note): (readonly [string, RawNote])[] => {
    if (note.isRest) {
      return [];
    }
    const group = pairingKey(note, 0);
    const ordinal = counts.get(group) ?? 0;
    counts.set(group, ordinal + 1);
    return [[pairingKey(note, ordinal), note]];
  });
}

/**
 * The measure's notes on the staves read, the paired notation staff's notes taking the string and fret of the tab
 * staff's note in the same place (same position, the same count of notes before it there).
 */
export function readStaffNotes(measure: PartMeasure, layout: PartLayout): readonly RawNote[] {
  const pair = layout.pairedTab;
  const read = measure.notes.filter((note) => layout.staves.has(note.staff));
  if (pair === undefined) {
    return read;
  }
  const tabByKey = new Map(keyed(measure.notes.filter((note) => note.staff === pair.tab)));
  const partner = new Map(keyed(read.filter((note) => note.staff === pair.notation)).map(([key, note]) => [note, tabByKey.get(key)]));
  return read.map((note) => {
    const tab = partner.get(note)?.tab;
    return note.tab === undefined && tab !== undefined ? { ...note, tab } : note;
  });
}
