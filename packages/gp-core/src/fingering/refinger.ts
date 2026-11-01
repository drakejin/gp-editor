// Easy fingering (AI Edit's exact part, no TuxGuitar counterpart): the notes of a scope re-assigned to strings and
// frets that keep every pitch, rhythm, tie and effect, so the hand moves and stretches as little as it can.
import type { NoteScope } from '../edit/edit-scope';
import { replaceAt } from '../edit/song-paths';
import type { Song } from '../model/song';
import { frettedTracks } from './fretted-tracks';
import { applyFingering } from './rebuild';
import { type FingeringCost, type FingeringPath, searchFingering } from './search';
import { buildTimeline } from './timeline';

export type { FingeringCost } from './search';

/** A re-fingered song: the notes put on another string, and what the fingering cost before and after. */
export interface Refingering {
  readonly song: Song;
  readonly restrung: number;
  readonly before: FingeringCost;
  readonly after: FingeringCost;
}

const NO_COST: FingeringCost = { total: 0, handTravel: 0 };
const HUNDREDTHS = 100;

function addCosts(a: FingeringCost, b: FingeringCost): FingeringCost {
  return { total: Math.round((a.total + b.total) * HUNDREDTHS) / HUNDREDTHS, handTravel: a.handTravel + b.handTravel };
}

/** The fingering as it is, which the search can always evaluate. */
function evaluated(path: FingeringPath | undefined): FingeringCost {
  return path?.cost ?? NO_COST;
}

/**
 * What the fingering of a scope's fretted tracks costs as it is: per track the hand's cheapest path through its notes
 * (FINGERING_COSTS, in frets of hand movement) and the frets it travels. A run of beats is costed with a beat either
 * side, where the hand comes from and goes to.
 */
export function fingeringCost(song: Song, scope: NoteScope): FingeringCost {
  return frettedTracks(song, scope).reduce((sum, [, track, scoped]) => addCosts(sum, evaluated(searchFingering(buildTimeline(track, scoped), 'evaluate'))), NO_COST);
}

/**
 * New song with the scope's notes re-fingered for easy playing: a dynamic programme over each fretted track's beats
 * (search.ts) puts every note on a string that keeps its pitch — rhythm, ties and effects as they were — so the hand
 * moves and stretches least: a chord's fretted notes within MAX_FRET_SPAN frets, open strings and low positions
 * preferred, a tied note on its note's string, hammer-ons, pull-offs and legato slides on one string with the note they
 * lead to, no note on a string another one still sounds, a bent, vibrato or sliding note never open, a natural
 * harmonic where it is, grace and trill frets moved with their note (never off the neck), a banjo's short 5th string
 * from its peg. A track changes only when that lowers its cost; drums and keyboard or other unfretted tracks never do.
 */
export function refinger(song: Song, scope: NoteScope): Refingering {
  let tracks = song.tracks;
  let before = NO_COST;
  let after = NO_COST;
  let restrung = 0;
  for (const [trackIndex, track, scoped] of frettedTracks(song, scope)) {
    const timeline = buildTimeline(track, scoped);
    const was = evaluated(searchFingering(timeline, 'evaluate'));
    const found = searchFingering(timeline, 'optimize');
    const isBetter = found !== undefined && found.restrung > 0 && found.cost.total < was.total;
    before = addCosts(before, was);
    after = addCosts(after, isBetter ? found.cost : was);
    if (isBetter) {
      tracks = replaceAt(tracks, trackIndex, applyFingering(track, timeline, found.choices));
      restrung += found.restrung;
    }
  }
  return { song: tracks === song.tracks ? song : { ...song, tracks }, restrung, before, after };
}
