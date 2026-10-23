// Not in TuxGuitar (its TESongParser.getGridPosition puts every component on a sixteenth grid): where in its measure
// each TablEdit component sounds.
import { QUARTER_TIME } from '../../model/song';
import { isTripletCode, tripletGridLength } from './tef-durations';
import type { TeComponent } from './tef-model';

/** Ticks per step of TablEdit's sixty-fourth grid. */
const TICKS_PER_GRID = QUARTER_TIME / 16;
/** Inside a run of triplets the grid is squeezed to 3/4: each step lasts 4/3 of a sixty-fourth. */
const TICKS_PER_TRIPLET_GRID = (TICKS_PER_GRID * 4) / 3;

/** A run of triplets in one voice: where it starts on the grid and where its next triplet would be. */
interface TripletRun {
  readonly measure: number;
  readonly start: number;
  end: number;
  lastPosition: number;
  lastOffset: number;
}

/**
 * Each component's offset in ticks from its measure start, components in sorted order. Notes and rests sit at their grid
 * step, but TablEdit lays a run of triplets in one voice out on a squeezed grid (three triplet eighths take the steps of
 * three sixteenths), so inside a run the steps are scaled back to time. Chords and texts take the offset of a note or
 * rest of their track at their step.
 */
export function buildComponentOffsets(components: readonly TeComponent[]): ReadonlyMap<TeComponent, number> {
  const offsets = new Map<TeComponent, number>();
  const runs = new Map<string, TripletRun>();
  const stepOffsets = new Map<string, number>();
  for (const component of components) {
    if (component.kind !== 'note' && component.kind !== 'rest') {
      continue;
    }
    const voice = component.kind === 'note' ? (component.attributes === 3 ? 1 : 0) : component.isLowerVoice ? 1 : 0;
    const offset = voiceOffset(runs, `${component.at.trackIndex}:${voice}`, component);
    offsets.set(component, offset);
    const step = stepKey(component);
    if (!stepOffsets.has(step)) {
      stepOffsets.set(step, offset);
    }
  }
  for (const component of components) {
    if (!offsets.has(component)) {
      offsets.set(component, stepOffsets.get(stepKey(component)) ?? component.at.position * TICKS_PER_GRID);
    }
  }
  return offsets;
}

function stepKey(component: TeComponent): string {
  return `${component.at.trackIndex}:${component.at.measure}:${component.at.position}`;
}

function voiceOffset(runs: Map<string, TripletRun>, key: string, component: TeComponent & { readonly duration: number }): number {
  const { measure, position } = component.at;
  if (!isTripletCode(component.duration)) {
    runs.delete(key);
    return position * TICKS_PER_GRID;
  }
  const run = runs.get(key);
  if (run !== undefined && run.measure === measure && run.lastPosition === position) {
    return run.lastOffset;
  }
  const isContinued = run !== undefined && run.measure === measure && run.end === position;
  const current: TripletRun = isContinued ? run : { measure, start: position, end: position, lastPosition: position, lastOffset: 0 };
  const offset = current.start * TICKS_PER_GRID + (position - current.start) * TICKS_PER_TRIPLET_GRID;
  current.end = position + tripletGridLength(component.duration);
  current.lastPosition = position;
  current.lastOffset = offset;
  runs.set(key, current);
  return offset;
}
