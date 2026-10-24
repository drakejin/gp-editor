// Crescendo and decrescendo in playback (not in TuxGuitar, which has no hairpins): Guitar Pro plays a hairpin from the
// dynamic where it starts to the dynamic after it; when that one does not go the hairpin's way, one dynamic further.
import { MAX_VELOCITY, MIN_VELOCITY, VELOCITY_INCREMENT } from '../formats/common/velocity';
import { durationTicks } from '../model/defaults';
import type { Beat, Hairpin } from '../model/song';
import { type PlacedNote, type PlayedBeat, type TrackContext, nextBeatPosition, previousBeatPosition } from './note-search';

/** The loudest struck note of a beat; undefined for a rest or tied notes only. */
function beatVelocity(beat: Beat): number | undefined {
  const velocities = beat.voices.flatMap((voice) => voice.notes.filter((note) => !note.isTied).map((note) => note.velocity));
  return velocities.length === 0 ? undefined : Math.max(...velocities);
}

function beatLength(beat: Beat): number {
  return Math.max(0, ...beat.voices.filter((voice) => !voice.isEmpty).map((voice) => durationTicks(voice.duration)));
}

/** The beats of the hairpin around the placed note, in playback order, and the beat after it (its position in the playback's beats). */
interface HairpinRun {
  readonly beats: readonly PlayedBeat[];
  readonly after?: PlayedBeat;
  readonly afterPosition?: number;
}

function runAround(context: TrackContext, placed: PlacedNote, hairpin: Hairpin): HairpinRun {
  const { beats } = context.playback;
  const previous = previousBeatPosition(context, placed.playedIndex, placed.beatIndex);
  let first = previous + 1;
  while (first > 0 && beats[first - 1]?.beat.hairpin === hairpin) {
    first--;
  }
  const next = nextBeatPosition(context, placed.playedIndex, placed.beatIndex);
  let end = next;
  while (end < beats.length && beats[end]?.beat.hairpin === hairpin) {
    end++;
  }
  const here: PlayedBeat = { beat: placed.beat, move: placed.move, playedIndex: placed.playedIndex };
  const run = [...beats.slice(first, previous + 1), here, ...beats.slice(next, end)];
  const after = beats[end];
  return after === undefined ? { beats: run } : { beats: run, after, afterPosition: end };
}

/** The dynamic the hairpin goes to: the next struck beat's when it goes the hairpin's way, else one dynamic further. */
function targetVelocity(context: TrackContext, run: HairpinRun, start: number, hairpin: Hairpin): number {
  const step = hairpin === 'crescendo' ? VELOCITY_INCREMENT : -VELOCITY_INCREMENT;
  const fallback = Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, start + step));
  if (run.afterPosition === undefined) {
    return fallback;
  }
  const next = firstVelocityFrom(context.playback.beats, run.afterPosition);
  return next !== undefined && (next - start) * step > 0 ? next : fallback;
}

/** The first struck beat's velocity from `position` of the playback's beats on. */
function firstVelocityFrom(beats: readonly PlayedBeat[], position: number): number | undefined {
  for (const played of beats.slice(position)) {
    const velocity = beatVelocity(played.beat);
    if (velocity !== undefined) {
      return velocity;
    }
  }
  return undefined;
}

/**
 * The velocity a note under a crescendo or decrescendo is struck at (before its accents): the hairpin's ramp at the
 * note's place, from the run's first struck beat to the beat after the run. Undefined for a note under no hairpin.
 */
export function hairpinVelocity(context: TrackContext, placed: PlacedNote): number | undefined {
  const { hairpin } = placed.beat;
  if (hairpin === undefined) {
    return undefined;
  }
  const run = runAround(context, placed, hairpin);
  const first = run.beats[0];
  const last = run.beats[run.beats.length - 1];
  const start = run.beats.map((played) => beatVelocity(played.beat)).find((velocity) => velocity !== undefined) ?? placed.note.velocity;
  if (first === undefined || last === undefined) {
    return start;
  }
  const runStart = first.beat.start + first.move;
  const runEnd = run.after === undefined ? last.beat.start + last.move + beatLength(last.beat) : run.after.beat.start + run.after.move;
  const fraction = runEnd > runStart ? (placed.beat.start + placed.move - runStart) / (runEnd - runStart) : 0;
  const target = targetVelocity(context, run, start, hairpin);
  return Math.round(start + (target - start) * Math.min(1, Math.max(0, fraction)));
}
