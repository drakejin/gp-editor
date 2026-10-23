// Crescendo and decrescendo in playback (not in TuxGuitar, which has no hairpins): Guitar Pro plays a hairpin from the
// dynamic where it starts to the dynamic after it; when that one does not go the hairpin's way, one dynamic further.
import { MAX_VELOCITY, MIN_VELOCITY, VELOCITY_INCREMENT } from '../formats/common/velocity';
import { durationTicks } from '../model/defaults';
import type { Beat, Hairpin } from '../model/song';
import { beatsAfter, beatsBefore, type PlacedNote, type PlayedBeat, type TrackContext } from './note-search';

/** The loudest struck note of a beat; undefined for a rest or tied notes only. */
function beatVelocity(beat: Beat): number | undefined {
  const velocities = beat.voices.flatMap((voice) => voice.notes.filter((note) => !note.isTied).map((note) => note.velocity));
  return velocities.length === 0 ? undefined : Math.max(...velocities);
}

function beatLength(beat: Beat): number {
  return Math.max(0, ...beat.voices.filter((voice) => !voice.isEmpty).map((voice) => durationTicks(voice.duration)));
}

/** The beats of the hairpin around the placed note, in playback order, and the beat after it. */
interface HairpinRun {
  readonly beats: readonly PlayedBeat[];
  readonly after?: PlayedBeat;
}

function runAround(context: TrackContext, placed: PlacedNote, hairpin: Hairpin): HairpinRun {
  const before: PlayedBeat[] = [];
  for (const played of beatsBefore(context, placed.playedIndex, placed.beatIndex)) {
    if (played.beat.hairpin !== hairpin) {
      break;
    }
    before.unshift(played);
  }
  const after: PlayedBeat[] = [];
  for (const played of beatsAfter(context, placed.playedIndex, placed.beatIndex)) {
    if (played.beat.hairpin !== hairpin) {
      return { beats: [...before, { beat: placed.beat, move: placed.move, playedIndex: placed.playedIndex }, ...after], after: played };
    }
    after.push(played);
  }
  return { beats: [...before, { beat: placed.beat, move: placed.move, playedIndex: placed.playedIndex }, ...after] };
}

/** The dynamic the hairpin goes to: the next struck beat's when it goes the hairpin's way, else one dynamic further. */
function targetVelocity(context: TrackContext, run: HairpinRun, start: number, hairpin: Hairpin): number {
  const step = hairpin === 'crescendo' ? VELOCITY_INCREMENT : -VELOCITY_INCREMENT;
  const fallback = Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, start + step));
  const after = run.after;
  if (after === undefined) {
    return fallback;
  }
  const next = [after, ...beatsAfter(context, after.playedIndex, beatIndexOf(context, after))].map((played) => beatVelocity(played.beat)).find((velocity) => velocity !== undefined);
  return next !== undefined && (next - start) * step > 0 ? next : fallback;
}

function beatIndexOf(context: TrackContext, played: PlayedBeat): number {
  const measureIndex = context.played[played.playedIndex]?.headerIndex ?? -1;
  return context.track.measures[measureIndex]?.beats.indexOf(played.beat) ?? -1;
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
