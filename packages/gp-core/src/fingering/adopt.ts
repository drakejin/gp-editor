// AI Edit's "Ask Claude to polish the fingering": Claude's positions taken only where they keep every pitch and rhythm
// and can be played — a chain moves whole or not at all, never onto a string another note holds, a beat's fretted notes
// within MAX_FRET_SPAN frets. Every position Claude gives is tried at once (a chord moved down a string, two notes
// trading strings), the ones that break a rule undone one at a time until the rest stand, and the undone ones tried again
// while any of them can now be taken. Optionally a track whose positions together make it harder to play keeps its own.
import { MAX_FRET_SPAN } from '../chords/creator';
import type { NoteScope } from '../edit/edit-scope';
import { replaceAt } from '../edit/song-paths';
import type { Song, Track } from '../model/song';
import { type ProposedPlace, proposedPlaces } from './adopt-match';
import { type Occupancy, buildOccupancy, holdsAlone, moveHold } from './adopt-occupancy';
import { frettedTracks } from './fretted-tracks';
import { applyFingering } from './rebuild';
import { searchFingering } from './search';
import { type Timeline, buildTimeline } from './timeline';

/** Why Claude's positions were not taken, counted by note. */
export interface PositionsNotTaken {
  /** A tie, hammer-on or slide's other note was not moved with it (or was moved elsewhere, or changed). */
  readonly linked: number;
  /** No such fret on that string: off the neck, an effect's fret off it, a bend or vibrato on the open string. */
  readonly unplayable: number;
  /** Another note holds that string while it would sound there. */
  readonly occupied: number;
  /** The beat's fretted notes would lie wider apart than a hand reaches. */
  readonly span: number;
  /** Taken together, the track's positions made it harder to play than it was (refusesHarder). */
  readonly harder: number;
}

/** The song with Claude's positions that passed, and what became of the others. */
export interface FingeringAdoption {
  readonly song: Song;
  /** Notes of the scope Claude put on another string at the same pitch and rhythm: taken or one of notTaken. */
  readonly suggested: number;
  readonly taken: number;
  /** Notes of the scope Claude gave another pitch or rhythm, or left out: they keep their place. */
  readonly rejected: number;
  readonly notTaken: PositionsNotTaken;
}

export interface AdoptOptions {
  /** Keep a track's own fingering when Claude's positions, taken together, cost more (fingeringCost) to play. */
  readonly refusesHarder?: boolean;
}

type Reason = keyof PositionsNotTaken;

const NONE_NOT_TAKEN: PositionsNotTaken = { linked: 0, unplayable: 0, occupied: 0, span: 0, harder: 0 };

/** One chain's move: from its string to Claude's, each note's option index there. */
interface Move {
  readonly chain: number;
  readonly from: number;
  readonly to: number;
  readonly indexes: ReadonlyMap<number, number>;
}

/** A chain's notes by chain id, in time order of their chains. */
function chainMembers(timeline: Timeline): ReadonlyMap<number, readonly number[]> {
  const members = new Map<number, number[]>();
  timeline.notes.forEach((note, id) => {
    const ids = members.get(note.chain);
    if (ids === undefined) {
      members.set(note.chain, [id]);
    } else {
      ids.push(id);
    }
  });
  return members;
}

/** What Claude asked of a chain: nothing, a move, or a move it cannot have (and why). */
function chainMove(timeline: Timeline, chain: number, ids: readonly number[], places: ReadonlyMap<number, ProposedPlace>): Move | Reason | undefined {
  if (!ids.some((id) => places.get(id)?.kind === 'moved')) {
    return undefined;
  }
  const strings = new Set(ids.map((id) => {
    const place = places.get(id);
    return place?.kind === 'moved' ? place.string : place?.kind === 'kept' ? timeline.notes[id]?.string : undefined;
  }));
  const [to] = [...strings];
  if (strings.size !== 1 || to === undefined) {
    return 'linked';
  }
  const indexes = new Map(ids.map((id) => [id, timeline.notes[id]?.options.findIndex((option) => option.string === to) ?? -1]));
  return [...indexes.values()].every((index) => index > 0) ? { chain, from: timeline.notes[ids[0] ?? -1]?.string ?? 0, to, indexes } : 'unplayable';
}

/** The fingering being built: each note's option index and each chain's string at each step. */
interface Building {
  readonly timeline: Timeline;
  readonly members: ReadonlyMap<number, readonly number[]>;
  readonly choices: Map<number, number>;
  readonly occupancy: Occupancy;
}

function stepSpan(building: Building, step: number, choices: ReadonlyMap<number, number>): number {
  const positions = (building.timeline.steps[step]?.noteIds ?? []).flatMap((id) => {
    const option = building.timeline.notes[id]?.options[choices.get(id) ?? 0];
    return option !== undefined && option.position > 0 ? [option.position] : [];
  });
  return positions.length === 0 ? 0 : Math.max(...positions) - Math.min(...positions);
}

/** Why a move applied now breaks a rule: its string held by another chain, or a beat of it wider than a hand. */
function brokenRule(building: Building, move: Move): Reason | undefined {
  if (!holdsAlone(building.occupancy, move.chain, move.to)) {
    return 'occupied';
  }
  const steps = new Set((building.members.get(move.chain) ?? []).map((id) => building.timeline.notes[id]?.step ?? -1));
  const isTooWide = [...steps].some((step) => {
    const span = stepSpan(building, step, building.choices);
    return span >= MAX_FRET_SPAN && span > stepSpan(building, step, new Map());
  });
  return isTooWide ? 'span' : undefined;
}

function apply(building: Building, move: Move): void {
  moveHold(building.occupancy, move.chain, move.from, move.to);
  move.indexes.forEach((index, id) => building.choices.set(id, index));
}

function undo(building: Building, move: Move): void {
  moveHold(building.occupancy, move.chain, move.to, move.from);
  move.indexes.forEach((_, id) => building.choices.delete(id));
}

/**
 * The moves applied together, then the ones that break a rule undone one at a time until those left all stand; the
 * undone ones with their last reason.
 */
function settle(building: Building, moves: readonly Move[]): Map<Move, Reason> {
  moves.forEach((move) => apply(building, move));
  const undone = new Map<Move, Reason>();
  for (let isChanged = true; isChanged; ) {
    isChanged = false;
    for (const move of moves) {
      const reason = undone.has(move) ? undefined : brokenRule(building, move);
      if (reason !== undefined) {
        undo(building, move);
        undone.set(move, reason);
        isChanged = true;
      }
    }
  }
  return undone;
}

/** Every move tried, again and again while a round takes any; what is left with why. */
function adoptMoves(building: Building, moves: readonly Move[]): Map<Move, Reason> {
  let pending = moves;
  let left = new Map<Move, Reason>();
  while (pending.length > 0) {
    left = settle(building, pending);
    if (left.size === pending.length) {
      break;
    }
    pending = [...left.keys()];
  }
  return left;
}

/** The moves Claude asks for, and the notes of the chains it cannot have by reason. */
function plannedMoves(timeline: Timeline, members: ReadonlyMap<number, readonly number[]>, places: ReadonlyMap<number, ProposedPlace>): { readonly moves: readonly Move[]; readonly refused: PositionsNotTaken } {
  const moves: Move[] = [];
  let refused = NONE_NOT_TAKEN;
  members.forEach((ids, chain) => {
    const planned = chainMove(timeline, chain, ids, places);
    if (typeof planned === 'string') {
      refused = { ...refused, [planned]: refused[planned] + ids.filter((id) => places.get(id)?.kind === 'moved').length };
    } else if (planned !== undefined) {
      moves.push(planned);
    }
  });
  return { moves, refused };
}

function isHarder(timeline: Timeline, choices: ReadonlyMap<number, number>): boolean {
  const before = searchFingering(timeline, 'evaluate')?.cost.total ?? 0;
  const after = searchFingering(timeline, 'evaluate', choices)?.cost.total ?? 0;
  return after > before;
}

interface TrackAdoption {
  readonly choices: ReadonlyMap<number, number>;
  readonly taken: number;
  readonly suggested: number;
  readonly rejected: number;
  readonly notTaken: PositionsNotTaken;
}

/** Claude's positions for one track. */
function adoptTrack(track: Track, proposal: Track | undefined, timeline: Timeline, options: AdoptOptions): TrackAdoption {
  const places = proposedPlaces(track, proposal, timeline);
  const members = chainMembers(timeline);
  const { moves, refused } = plannedMoves(timeline, members, places);
  const building: Building = { timeline, members, choices: new Map(), occupancy: buildOccupancy(timeline, members) };
  const left = adoptMoves(building, moves);
  let notTaken = refused;
  left.forEach((reason, move) => {
    notTaken = { ...notTaken, [reason]: notTaken[reason] + move.indexes.size };
  });
  const all = [...places.values()];
  const counts = { suggested: all.filter((place) => place.kind === 'moved').length, rejected: all.filter((place) => place.kind === 'missing').length };
  const taken = building.choices.size;
  if (taken > 0 && options.refusesHarder === true && isHarder(timeline, building.choices)) {
    return { ...counts, choices: new Map(), taken: 0, notTaken: { ...notTaken, harder: notTaken.harder + taken } };
  }
  return { ...counts, choices: building.choices, taken, notTaken };
}

function addNotTaken(a: PositionsNotTaken, b: PositionsNotTaken): PositionsNotTaken {
  return { linked: a.linked + b.linked, unplayable: a.unplayable + b.unplayable, occupied: a.occupied + b.occupied, span: a.span + b.span, harder: a.harder + b.harder };
}

/**
 * Claude's fingering of the scope (`proposal`: the song with Claude's bars written in) checked note by note against
 * `song`: a note Claude plays at the same moment, for as long and at the same pitch on another string is taken there
 * when its whole chain (ties, hammer-ons, legato slides) moves with it, the string is free while it sounds and the beat
 * stays within the hand's span — all of Claude's positions tried together, so a shape moved whole or two notes trading
 * strings are taken; a note Claude gave another pitch or rhythm, or left out, is rejected and keeps its place. With
 * `refusesHarder`, a track whose taken positions together cost more to play (fingeringCost) keeps its own. Only the
 * strings and frets of the scope's fretted tracks change — effects, ties and rhythm are `song`'s.
 */
export function adoptFingering(song: Song, proposal: Song, scope: NoteScope, options: AdoptOptions = {}): FingeringAdoption {
  let tracks = song.tracks;
  let total = { suggested: 0, taken: 0, rejected: 0, notTaken: NONE_NOT_TAKEN };
  for (const [trackIndex, track, scoped] of frettedTracks(song, scope)) {
    const timeline = buildTimeline(track, scoped);
    const adopted = adoptTrack(track, proposal.tracks[trackIndex], timeline, options);
    total = {
      suggested: total.suggested + adopted.suggested,
      taken: total.taken + adopted.taken,
      rejected: total.rejected + adopted.rejected,
      notTaken: addNotTaken(total.notTaken, adopted.notTaken),
    };
    if (adopted.taken > 0) {
      tracks = replaceAt(tracks, trackIndex, applyFingering(track, timeline, adopted.choices));
    }
  }
  return { song: tracks === song.tracks ? song : { ...song, tracks }, ...total };
}
