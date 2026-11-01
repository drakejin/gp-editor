// Claude's answer to "polish the fingering", note by note: for each note of the scope, the note the proposal plays at
// the same moment, for as long, at the same pitch — or none (Claude changed it, or left it out).
import { durationTicks } from '../model/defaults';
import type { Note, Track } from '../model/song';
import type { Timeline, TimelineNote } from './timeline';

/** What the proposal did with a note: left it out or changed its pitch or rhythm, kept its place, or moved it. */
export type ProposedPlace = { readonly kind: 'missing' } | { readonly kind: 'kept' } | { readonly kind: 'moved'; readonly string: number };

const MISSING: ProposedPlace = { kind: 'missing' };
const KEPT: ProposedPlace = { kind: 'kept' };

function pitchOf(track: Track, note: Note): number {
  return (track.strings[note.string - 1]?.tuning ?? Number.NaN) + note.fret;
}

/** The proposal's notes that start with `note` and last as long, in its voice. */
function candidatesAt(proposal: Track, note: TimelineNote): readonly Note[] {
  const beat = proposal.measures[note.measureIndex]?.beats.find((candidate) => candidate.start === note.start);
  const voice = beat?.voices[note.voiceIndex];
  return voice === undefined || voice.isEmpty || durationTicks(voice.duration) !== note.end - note.start ? [] : voice.notes;
}

/** Where the proposal plays each note of the timeline's scope, by note id (notes outside the scope are left out). */
export function proposedPlaces(track: Track, proposal: Track | undefined, timeline: Timeline): ReadonlyMap<number, ProposedPlace> {
  const places = new Map<number, ProposedPlace>();
  const claimed = new Set<Note>();
  timeline.notes.forEach((note, id) => {
    if (!note.isInScope) {
      return;
    }
    const pitch = pitchOf(track, note.note);
    const same = (proposal === undefined ? [] : candidatesAt(proposal, note)).filter((candidate) => !claimed.has(candidate) && proposal !== undefined && pitchOf(proposal, candidate) === pitch);
    const found = same.find((candidate) => candidate.string === note.string) ?? same[0];
    if (found !== undefined) {
      claimed.add(found);
    }
    places.set(id, found === undefined ? MISSING : found.string === note.string ? KEPT : { kind: 'moved', string: found.string });
  });
  return places;
}
