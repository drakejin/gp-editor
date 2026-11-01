// AI Edit's "Ask Claude to polish the fingering": Claude's positions taken only where they keep every pitch and rhythm
// and can be played — a chain moves whole or not at all, never onto a string another note holds, a beat's fretted notes
// within MAX_FRET_SPAN frets. Everything else stays as the optimizer placed it.
import { MAX_FRET_SPAN } from '../chords/creator';
import type { NoteScope } from '../edit/edit-scope';
import { replaceAt } from '../edit/song-paths';
import type { Song, Track } from '../model/song';
import { type ProposedPlace, proposedPlaces } from './adopt-match';
import { frettedTracks } from './fretted-tracks';
import { applyFingering } from './rebuild';
import { type Timeline, buildTimeline } from './timeline';

/** The song with Claude's positions that passed, and how many notes Claude moved, how many were taken and rejected. */
export interface FingeringAdoption {
  readonly song: Song;
  /** Notes of the scope Claude put on another string at the same pitch and rhythm. */
  readonly suggested: number;
  /** Those now played there. */
  readonly taken: number;
  /** Notes of the scope Claude gave another pitch or rhythm, or left out: they keep their place. */
  readonly rejected: number;
}

interface Counts {
  readonly suggested: number;
  readonly taken: number;
  readonly rejected: number;
}

/** A chain's notes by chain id, in the scope or not. */
function chainMembers(timeline: Timeline): ReadonlyMap<number, readonly number[]> {
  const members = new Map<number, number[]>();
  timeline.notes.forEach((note, id) => members.set(note.chain, [...(members.get(note.chain) ?? []), id]));
  return members;
}

/** The string every note of a chain is proposed on, with the option index each needs; undefined when they disagree or cannot. */
function chainMove(timeline: Timeline, ids: readonly number[], places: ReadonlyMap<number, ProposedPlace>): ReadonlyMap<number, number> | undefined {
  const strings = new Set(ids.map((id) => {
    const place = places.get(id);
    return place?.kind === 'moved' ? place.string : place?.kind === 'kept' ? timeline.notes[id]?.string : undefined;
  }));
  const [string] = [...strings];
  if (strings.size !== 1 || string === undefined || string === timeline.notes[ids[0] ?? -1]?.string) {
    return undefined;
  }
  const indexes = ids.map((id) => timeline.notes[id]?.options.findIndex((option) => option.string === string) ?? -1);
  return indexes.every((index) => index > 0) ? new Map(ids.map((id, i) => [id, indexes[i] ?? 0])) : undefined;
}

/** When a chain holds its string: its first note's start to its last note's end. */
interface Hold {
  readonly start: number;
  readonly end: number;
}

/** The fingering being built: each note's option index, each chain's hold, and the chains on each string. */
interface Assignment {
  readonly choices: Map<number, number>;
  readonly holds: ReadonlyMap<number, Hold>;
  readonly onString: Map<number, Set<number>>;
}

function startAssignment(timeline: Timeline, members: ReadonlyMap<number, readonly number[]>): Assignment {
  const holds = new Map<number, Hold>();
  const onString = new Map<number, Set<number>>();
  members.forEach((ids, chain) => {
    const notes = ids.flatMap((id) => timeline.notes[id] ?? []);
    holds.set(chain, { start: Math.min(...notes.map((note) => note.start)), end: Math.max(...notes.map((note) => note.end)) });
    notes.forEach((note) => onString.set(note.string, new Set([...(onString.get(note.string) ?? []), chain])));
  });
  return { choices: new Map(), holds, onString };
}

/** True when no other chain holds `string` while this chain would (their holds overlap). */
function isStringFree(assignment: Assignment, chain: number, string: number): boolean {
  const hold = assignment.holds.get(chain);
  return hold !== undefined && [...(assignment.onString.get(string) ?? [])].every((other) => {
    const held = assignment.holds.get(other);
    return other === chain || held === undefined || held.end <= hold.start || held.start >= hold.end;
  });
}

function moveChain(assignment: Assignment, chain: number, from: number, to: number, moved: ReadonlyMap<number, number>): void {
  moved.forEach((index, id) => assignment.choices.set(id, index));
  assignment.onString.get(from)?.delete(chain);
  assignment.onString.set(to, new Set([...(assignment.onString.get(to) ?? []), chain]));
}

function stepSpan(timeline: Timeline, assignment: Assignment, step: number, moved: ReadonlyMap<number, number>): number {
  const positions = (timeline.steps[step]?.noteIds ?? []).flatMap((id) => {
    const option = timeline.notes[id]?.options[moved.get(id) ?? assignment.choices.get(id) ?? 0];
    return option !== undefined && option.position > 0 ? [option.position] : [];
  });
  return positions.length === 0 ? 0 : Math.max(...positions) - Math.min(...positions);
}

/** True when the steps the chain plays in stay within MAX_FRET_SPAN (or no wider than they were). */
function keepsSpans(timeline: Timeline, assignment: Assignment, moved: ReadonlyMap<number, number>): boolean {
  const steps = new Set([...moved.keys()].map((id) => timeline.notes[id]?.step ?? -1));
  return [...steps].every((step) => {
    const span = stepSpan(timeline, assignment, step, moved);
    return span < MAX_FRET_SPAN || span <= stepSpan(timeline, assignment, step, new Map());
  });
}

/** Claude's positions for one track: each chain moved when it can be, in the order the chains start. */
function adoptTrack(track: Track, proposal: Track | undefined, timeline: Timeline): { readonly choices: ReadonlyMap<number, number>; readonly counts: Counts } {
  const places = proposedPlaces(track, proposal, timeline);
  const members = chainMembers(timeline);
  const assignment = startAssignment(timeline, members);
  let taken = 0;
  for (const [chain, ids] of members) {
    const moved = chainMove(timeline, ids, places);
    const first = timeline.notes[ids[0] ?? -1];
    const string = moved === undefined ? undefined : first?.options[moved.get(ids[0] ?? -1) ?? 0]?.string;
    if (moved !== undefined && first !== undefined && string !== undefined && isStringFree(assignment, chain, string) && keepsSpans(timeline, assignment, moved)) {
      moveChain(assignment, chain, first.string, string, moved);
      taken += moved.size;
    }
  }
  const all = [...places.values()];
  return {
    choices: assignment.choices,
    counts: { suggested: all.filter((place) => place.kind === 'moved').length, taken, rejected: all.filter((place) => place.kind === 'missing').length },
  };
}

/**
 * Claude's fingering of the scope (`proposal`: the song with Claude's bars written in) checked note by note against
 * `song`: a note Claude plays at the same moment, for as long and at the same pitch on another string is taken there
 * when its whole chain (ties, hammer-ons, legato slides) moves with it, the string is free while it sounds and the
 * beat stays within the hand's span; a note Claude gave another pitch or rhythm, or left out, is rejected and keeps its
 * place. Only the strings and frets of the scope's fretted tracks change — effects, ties and rhythm are `song`'s.
 */
export function adoptFingering(song: Song, proposal: Song, scope: NoteScope): FingeringAdoption {
  let tracks = song.tracks;
  let counts: Counts = { suggested: 0, taken: 0, rejected: 0 };
  for (const [trackIndex, track, scoped] of frettedTracks(song, scope)) {
    const timeline = buildTimeline(track, scoped);
    const adopted = adoptTrack(track, proposal.tracks[trackIndex], timeline);
    counts = { suggested: counts.suggested + adopted.counts.suggested, taken: counts.taken + adopted.counts.taken, rejected: counts.rejected + adopted.counts.rejected };
    if (adopted.counts.taken > 0) {
      tracks = replaceAt(tracks, trackIndex, applyFingering(track, timeline, adopted.choices));
    }
  }
  return { song: tracks === song.tracks ? song : { ...song, tracks }, ...counts };
}
