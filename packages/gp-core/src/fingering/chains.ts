// Notes that must share a string: a tied note and the note it continues, a hammer-on / pull-off or a shift / legato
// slide and the note it leads to. Ties are found as edit/ties.ts finds them (the previous event of the voice, this bar
// or the last of the bar before); links as the score draws them (the next note on the string in the voice, this bar or
// the next, a rest ending the search — the app's symbols/links.ts).
import type { Note, Track } from '../model/song';

/** Where a note is: its beat, voice and string. */
export interface NoteSpot {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
  readonly string: number;
}

/** A track's notes to chain, each with its id (its place in the list). */
export interface ChainedNote extends NoteSpot {
  readonly note: Note;
}

function spotKey(spot: NoteSpot): string {
  return `${spot.measureIndex}:${spot.beatIndex}:${spot.voiceIndex}:${spot.string}`;
}

/** The previous event of a voice before a beat: in its measure, else the last event of the measure before. */
function previousEvent(track: Track, measureIndex: number, beatIndex: number, voiceIndex: number): { readonly measureIndex: number; readonly beatIndex: number } | undefined {
  for (const m of [measureIndex, measureIndex - 1]) {
    const beats = track.measures[m]?.beats ?? [];
    for (let b = (m === measureIndex ? beatIndex : beats.length) - 1; b >= 0; b--) {
      const voice = beats[b]?.voices[voiceIndex];
      if (voice !== undefined && !voice.isEmpty) {
        return { measureIndex: m, beatIndex: b };
      }
    }
  }
  return undefined;
}

interface EventSpot {
  readonly measureIndex: number;
  readonly beatIndex: number;
}

/** The events of a voice after a beat, later in its measure then in the next, up to a rest (left out). */
function eventsAfter(track: Track, spot: NoteSpot): readonly EventSpot[] {
  const events: EventSpot[] = [];
  for (const m of [spot.measureIndex, spot.measureIndex + 1]) {
    const beats = track.measures[m]?.beats ?? [];
    for (let b = m === spot.measureIndex ? spot.beatIndex + 1 : 0; b < beats.length; b++) {
      const voice = beats[b]?.voices[spot.voiceIndex];
      if (voice !== undefined && !voice.isEmpty) {
        if (voice.notes.length === 0) {
          return events;
        }
        events.push({ measureIndex: m, beatIndex: b });
      }
    }
  }
  return events;
}

/** The next note on a string in a voice after a beat: later in its measure, else early in the next; a rest ends it. */
function nextOnString(track: Track, spot: NoteSpot): NoteSpot | undefined {
  const found = eventsAfter(track, spot).find(({ measureIndex, beatIndex }) =>
    track.measures[measureIndex]?.beats[beatIndex]?.voices[spot.voiceIndex]?.notes.some((note) => note.string === spot.string),
  );
  return found === undefined ? undefined : { ...found, voiceIndex: spot.voiceIndex, string: spot.string };
}

function leadsOn(note: Note): boolean {
  return note.effect.hammer || note.effect.slides.some((slide) => slide === 'shift' || slide === 'legato');
}

/** How a track's notes hang together. */
export interface NoteLinks {
  /** Each note's chain: the smallest id among the notes it is tied or linked to, directly or through others. */
  readonly chains: readonly number[];
  /** Ties and links that reach no note: such a note stays where it is. */
  readonly loose: ReadonlySet<number>;
  /** Strings a note may not take, by id: where a loose tie or link would reach it. */
  readonly barred: ReadonlyMap<number, ReadonlySet<number>>;
}

interface Linking {
  readonly track: Track;
  readonly notes: readonly ChainedNote[];
  readonly idOf: ReadonlyMap<string, number>;
  /** Note ids by `measure:beat:voice`. */
  readonly byEvent: ReadonlyMap<string, readonly number[]>;
  readonly pairs: (readonly [number, number])[];
  readonly loose: Set<number>;
  readonly barred: Map<number, Set<number>>;
}

/** No note of the voice at these events may take the string: a loose tie or link would reach it there. */
function bar(linking: Linking, events: readonly EventSpot[], voiceIndex: number, string: number): void {
  for (const event of events) {
    for (const id of linking.byEvent.get(`${event.measureIndex}:${event.beatIndex}:${voiceIndex}`) ?? []) {
      linking.barred.set(id, new Set([...(linking.barred.get(id) ?? []), string]));
    }
  }
}

function linkTie(linking: Linking, entry: ChainedNote, id: number): void {
  const previous = previousEvent(linking.track, entry.measureIndex, entry.beatIndex, entry.voiceIndex);
  const other = previous === undefined ? undefined : linking.idOf.get(spotKey({ ...previous, voiceIndex: entry.voiceIndex, string: entry.string }));
  if (other !== undefined) {
    linking.pairs.push([other, id]);
    return;
  }
  linking.loose.add(id);
  bar(linking, previous === undefined ? [] : [previous], entry.voiceIndex, entry.string);
}

function linkOn(linking: Linking, entry: ChainedNote, id: number): void {
  const next = nextOnString(linking.track, entry);
  const other = next === undefined ? undefined : linking.idOf.get(spotKey(next));
  if (other !== undefined) {
    linking.pairs.push([id, other]);
    return;
  }
  linking.loose.add(id);
  bar(linking, eventsAfter(linking.track, entry), entry.voiceIndex, entry.string);
}

/** Ties back and links forward between a track's notes, as chains, and what a loose tie or link holds in place. */
export function noteLinks(track: Track, notes: readonly ChainedNote[]): NoteLinks {
  const byEvent = new Map<string, number[]>();
  notes.forEach((entry, id) => {
    const key = `${entry.measureIndex}:${entry.beatIndex}:${entry.voiceIndex}`;
    byEvent.set(key, [...(byEvent.get(key) ?? []), id]);
  });
  const linking: Linking = { track, notes, idOf: new Map(notes.map((entry, id) => [spotKey(entry), id])), byEvent, pairs: [], loose: new Set(), barred: new Map() };
  notes.forEach((entry, id) => {
    if (entry.note.isTied) {
      linkTie(linking, entry, id);
    }
    if (leadsOn(entry.note)) {
      linkOn(linking, entry, id);
    }
  });
  const parent = notes.map((_, id) => id);
  const root = (id: number): number => {
    let current = id;
    while (parent[current] !== current) {
      current = parent[current] ?? current;
    }
    return current;
  };
  for (const [a, b] of linking.pairs) {
    const [low, high] = [root(a), root(b)].sort((x, y) => x - y) as [number, number];
    parent[high] = low;
  }
  return { chains: notes.map((_, id) => root(id)), loose: linking.loose, barred: linking.barred };
}
