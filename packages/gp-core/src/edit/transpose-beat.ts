// One beat of a transposition: which notes move, where they go, and the tied notes that follow them (TuxGuitar's
// TGMeasureManager.transposeNotes works beat by beat too, without following ties).
import type { Beat, Note, Voice } from '../model/song';
import { shiftEffectFrets } from './retune';
import { sortByString } from './song-paths';
import type { StringPlacement } from './string-placement';
import { placeMovingNotes } from './transpose-placement';

/** What happened to a note of the previous event: moved (to a string, at a pitch from the capo), left as it was, or not transposed. */
export type NoteFate =
  | { readonly kind: 'moved'; readonly string: number; readonly pitch: number }
  | { readonly kind: 'stuck' }
  | { readonly kind: 'kept' };

/** The last event of one voice: its measure and each of its notes' fate, by the note's old string. */
export interface VoiceMemory {
  readonly measureIndex: number;
  readonly fates: ReadonlyMap<number, NoteFate>;
}

/** The last event of each voice so far. */
export type TieMemory = readonly (VoiceMemory | undefined)[];

/** What one beat's transposition reads: the track's strings and neck, and which notes move where. */
export interface BeatContext {
  readonly tuning: readonly number[];
  /** Capo fret: sounding pitches are open string + capo + fret. */
  readonly offset: number;
  readonly neck: number;
  readonly measureIndex: number;
  /** True when a note of this voice is to move (the scope, unless only chords move). */
  readonly isMoving: (voiceIndex: number) => boolean;
  /** A sounding pitch's new pitch. */
  readonly movePitch: (pitch: number) => number;
}

export interface BeatTransposition {
  readonly beat: Beat;
  readonly moved: number;
  readonly unplaced: number;
  readonly memory: TieMemory;
}

/** A note's plan: not transposed, left as it was (the note it is tied to stayed), or moving to a pitch from the capo. */
type Plan =
  | { readonly kind: 'kept' }
  | { readonly kind: 'stuck' }
  | { readonly kind: 'move'; readonly pitch: number; readonly preferredString: number; readonly tieString?: number; readonly isUntied: boolean };

interface Moving {
  readonly voiceIndex: number;
  /** `voiceIndex:noteIndex`, the note's place in the beat. */
  readonly key: string;
  readonly note: Note;
  readonly plan: Extract<Plan, { kind: 'move' }>;
}

const KEPT: Plan = { kind: 'kept' };
const STUCK: Plan = { kind: 'stuck' };

/** The note a tied note continues: in the last event of its voice, in this measure or the one before. */
function tieFor(memory: VoiceMemory | undefined, measureIndex: number, string: number): NoteFate | undefined {
  return memory !== undefined && memory.measureIndex >= measureIndex - 1 ? memory.fates.get(string) : undefined;
}

/**
 * A tied note follows the note it continues wherever that moved (also past the scope); a note in the scope moves —
 * starting afresh when the note it was tied to is not transposed, staying when that note could not move.
 */
function planNote(note: Note, voiceIndex: number, context: BeatContext, memory: TieMemory): Plan {
  const open = context.tuning[note.string - 1];
  const tie = note.isTied ? tieFor(memory[voiceIndex], context.measureIndex, note.string) : undefined;
  if (open === undefined) {
    return KEPT;
  }
  if (tie?.kind === 'moved') {
    return { kind: 'move', pitch: tie.pitch, preferredString: tie.string, tieString: tie.string, isUntied: false };
  }
  if (!context.isMoving(voiceIndex)) {
    return KEPT;
  }
  if (tie?.kind === 'stuck') {
    return STUCK;
  }
  const pitch = context.movePitch(open + context.offset + note.fret) - context.offset;
  return { kind: 'move', pitch, preferredString: note.string, isUntied: tie?.kind === 'kept' };
}

/** The note on its new string. A tie forced off the string of the note it continues is undone (ties stay on one string). */
function movedNote({ note, plan }: Moving, placement: StringPlacement): Note {
  const isTied = note.isTied && !plan.isUntied && (plan.tieString === undefined || plan.tieString === placement.string);
  return { ...note, string: placement.string, fret: placement.fret, isTied, effect: shiftEffectFrets(note.effect, placement.fret - note.fret) };
}

/** Where each moving note goes (undefined: it stays as it was); tied notes first, so they keep their note's string. */
function placeBeat(moving: readonly Moving[], plans: readonly (readonly Plan[])[], beat: Beat, context: BeatContext): ReadonlyMap<string, StringPlacement | undefined> {
  const ordered = [...moving.filter((item) => item.plan.tieString !== undefined), ...moving.filter((item) => item.plan.tieString === undefined)];
  const taken = new Set(beat.voices.flatMap((voice, v) => voice.notes.filter((_, i) => plans[v]?.[i]?.kind !== 'move').map((note) => note.string)));
  const notes = ordered.map(({ note, plan }) => ({ pitch: plan.pitch, preferredString: plan.preferredString, string: note.string }));
  const placements = placeMovingNotes(notes, context.tuning, context.neck, taken);
  return new Map(ordered.map((item, i) => [item.key, placements[i]]));
}

function fateOf(plan: Plan, placement: StringPlacement | undefined): NoteFate {
  if (plan.kind === 'kept') {
    return { kind: 'kept' };
  }
  return plan.kind === 'stuck' || placement === undefined ? { kind: 'stuck' } : { kind: 'moved', string: placement.string, pitch: plan.pitch };
}

function remember(beat: Beat, plans: readonly (readonly Plan[])[], placed: ReadonlyMap<string, StringPlacement | undefined>, context: BeatContext, memory: TieMemory): TieMemory {
  return beat.voices.map((voice, v) => {
    if (voice.isEmpty) {
      return memory[v];
    }
    const fates = new Map(voice.notes.map((note, i): [number, NoteFate] => [note.string, fateOf(plans[v]?.[i] ?? KEPT, placed.get(`${v}:${i}`))]));
    return { measureIndex: context.measureIndex, fates };
  });
}

function rebuildVoice(voice: Voice, moving: readonly Moving[], placed: ReadonlyMap<string, StringPlacement | undefined>): Voice {
  const notes = voice.notes.map((note, i) => {
    const item = moving.find((candidate) => candidate.key.endsWith(`:${i}`));
    const placement = item === undefined ? undefined : placed.get(item.key);
    return item === undefined || placement === undefined ? note : movedNote(item, placement);
  });
  return notes.every((note, i) => note === voice.notes[i]) ? voice : { ...voice, notes: sortByString(notes) };
}

/** The beat with its moving notes placed (the chord is the caller's), and the counts and memory for the next beat. */
export function transposeBeatNotes(beat: Beat, context: BeatContext, memory: TieMemory): BeatTransposition {
  const plans = beat.voices.map((voice, v) => voice.notes.map((note) => planNote(note, v, context, memory)));
  const moving = beat.voices.flatMap((voice, voiceIndex) =>
    voice.notes.flatMap((note, i): Moving[] => {
      const plan = plans[voiceIndex]?.[i];
      return plan?.kind === 'move' ? [{ voiceIndex, key: `${voiceIndex}:${i}`, note, plan }] : [];
    }),
  );
  const placed = moving.length === 0 ? new Map<string, StringPlacement | undefined>() : placeBeat(moving, plans, beat, context);
  const voices = beat.voices.map((voice, v) => rebuildVoice(voice, moving.filter((item) => item.voiceIndex === v), placed));
  const moved = [...placed.values()].filter((placement) => placement !== undefined).length;
  const stuck = plans.flat().filter((plan) => plan.kind === 'stuck').length;
  return {
    beat: voices.every((voice, v) => voice === beat.voices[v]) ? beat : { ...beat, voices },
    moved,
    unplaced: stuck + placed.size - moved,
    memory: remember(beat, plans, placed, context, memory),
  };
}
