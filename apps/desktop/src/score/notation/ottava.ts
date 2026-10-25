import { type Measure, ottavaOctaves } from '@gp-editor/core';
import type { DrawCommand } from '../draw';
import type { Chord } from './chords';
import type { VoiceEvent } from './events';
import { horizontal, vertical } from './glyphs';
import { GLYPH_WIDTH, OTTAVA, STAFF, positionY } from './metrics';

const LABELS: ReadonlyMap<number, string> = new Map([
  [1, '8va'],
  [2, '15ma'],
  [3, '22ma'],
  [-1, '8vb'],
  [-2, '15mb'],
  [-3, '22mb'],
]);

/** Consecutive events drawn with the same octave shift, and where the run reaches (undefined: nothing to mark). */
interface OttavaRun {
  readonly ottava: number;
  readonly chords: readonly Chord[];
  readonly left?: number;
  readonly right?: number;
  readonly firstBeat: number;
  readonly lastBeat: number;
  /** A written sign running on from the bar before (no new label, the line from the bar line) … */
  readonly fromBefore?: boolean;
  /** … or into the next bar (the line to the bar line, no hook). */
  readonly intoNext?: boolean;
}

/** Where a measure's written signs meet its neighbours. */
export interface OttavaEdges {
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  /** A sign running into a row's first bar is named again. */
  readonly isRowStart?: boolean;
  /** The bar line on the right. */
  readonly width: number;
}

/** Half a rest's width: where a written sign over rests reaches. */
const REST_HALF = GLYPH_WIDTH.rest / 2;

/** Where an event reaches: its noteheads, or (when `withRests`) a rest's glyph. */
function extentOf(
  event: VoiceEvent,
  chord: Chord | undefined,
  withRests: boolean,
): readonly [number, number] | undefined {
  if (chord !== undefined) {
    return [chord.left, chord.right];
  }
  return withRests ? [event.x - REST_HALF, event.x + REST_HALF] : undefined;
}

function grow(
  run: OttavaRun | undefined,
  event: VoiceEvent,
  chord: Chord | undefined,
  withRests: boolean,
): OttavaRun {
  const extent = extentOf(event, chord, withRests);
  const base: OttavaRun = run ?? {
    ottava: event.ottava,
    chords: [],
    firstBeat: event.beatIndex,
    lastBeat: event.beatIndex,
  };
  return {
    ...base,
    chords: chord === undefined ? base.chords : [...base.chords, chord],
    lastBeat: Math.max(base.lastBeat, event.beatIndex),
    ...(extent === undefined
      ? {}
      : {
          left: Math.min(base.left ?? extent[0], extent[0]),
          right: Math.max(base.right ?? extent[1], extent[1]),
        }),
  };
}

/** Runs of the events at `indexes` (in playing order): a new run where `isNewRun` says so. */
function runsOf(
  indexes: readonly number[],
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
  isNewRun: (index: number, previous: number) => boolean,
  withRests: boolean,
): OttavaRun[] {
  return indexes.reduce<OttavaRun[]>((runs, index, position) => {
    const event = events[index];
    if (event === undefined) {
      return runs;
    }
    const previous = indexes[position - 1];
    const last = runs[runs.length - 1];
    return last !== undefined &&
      previous !== undefined &&
      !isNewRun(index, previous)
      ? [...runs.slice(0, -1), grow(last, event, chords[index], withRests)]
      : [...runs, grow(undefined, event, chords[index], withRests)];
  }, []);
}

/** The engraver's own shifts, voice by voice, from note to note (a beat with a written sign is apart). */
function chosenRuns(
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
): OttavaRun[] {
  const voices = [...new Set(events.map(event => event.voiceIndex))];
  return voices.flatMap(voiceIndex => {
    const indexes = events.flatMap((event, index) =>
      event.voiceIndex === voiceIndex && event.isWrittenOttava !== true
        ? [index]
        : [],
    );
    return runsOf(
      indexes,
      events,
      chords,
      (index, previous) => events[index]?.ottava !== events[previous]?.ottava,
      false,
    );
  });
}

/** The shift a bar's first or last played beat is written under. */
function edgeShift(
  measure: Measure | undefined,
  end: 'first' | 'last',
): number {
  const played = (measure?.beats ?? []).filter(beat =>
    beat.voices.some(voice => !voice.isEmpty),
  );
  return ottavaOctaves(
    (end === 'first' ? played[0] : played[played.length - 1])?.ottava,
  );
}

/** The beats' written signs: one run per sign over every voice of its beats (rests too), joined to the bars either side. */
function writtenRuns(
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
  edges: OttavaEdges,
): OttavaRun[] {
  const beats = [...new Set(events.map(event => event.beatIndex))].sort(
    (a, b) => a - b,
  );
  const indexes = events
    .flatMap((event, index) => (event.isWrittenOttava === true ? [index] : []))
    .sort((a, b) => (events[a]?.beatIndex ?? 0) - (events[b]?.beatIndex ?? 0));
  const isNewRun = (index: number, previous: number): boolean => {
    const [here, before] = [events[index], events[previous]];
    return (
      here?.ottava !== before?.ottava ||
      beats.indexOf(here?.beatIndex ?? -1) -
        beats.indexOf(before?.beatIndex ?? -1) >
        1
    );
  };
  return runsOf(indexes, events, chords, isNewRun, true).map(run => ({
    ...run,
    fromBefore:
      run.firstBeat === beats[0] &&
      edgeShift(edges.previousMeasure, 'last') === run.ottava,
    intoNext:
      run.lastBeat === beats[beats.length - 1] &&
      edgeShift(edges.nextMeasure, 'first') === run.ottava,
  }));
}

/** Where a run's mark goes: over its highest note and the staff for 8va / 15ma, under its lowest and the staff for 8vb / 15mb. */
function runMarkY(run: OttavaRun, top: number): number {
  const ys = run.chords.flatMap(chord => chord.heads.map(head => head.y));
  return run.ottava > 0 ? Math.min(top, ...ys) - OTTAVA.gap : Math.max(positionY(top, STAFF.bottomLine), ...ys) + OTTAVA.gap;
}

/**
 * "8va" over (or "8vb" under) the run's notes, with a line to the end of the run and a hook towards the staff. A written
 * sign running on from the bar before has no new label (but at a row start), one running on into the next has no hook.
 */
function runMarks(
  run: OttavaRun,
  top: number,
  color: string,
  edges: OttavaEdges,
): DrawCommand[] {
  const label = LABELS.get(run.ottava);
  if (
    label === undefined ||
    run.left === undefined ||
    run.right === undefined
  ) {
    return [];
  }
  const isAbove = run.ottava > 0;
  const y = runMarkY(run, top);
  const isLabelled = run.fromBefore !== true || edges.isRowStart === true;
  const labels: DrawCommand[] = isLabelled
    ? [{ kind: 'text', x: run.left, y, text: label, size: OTTAVA.fontSize, color, font: 'ui', align: 'left' }]
    : [];
  const lineStart = isLabelled
    ? run.left + label.length * OTTAVA.charWidth + OTTAVA.labelGap
    : 0;
  const lineEnd = run.intoNext === true ? edges.width : run.right;
  if (lineEnd - lineStart < OTTAVA.minLine) {
    return labels;
  }
  const hook = isAbove ? OTTAVA.hook : -OTTAVA.hook;
  const hooks =
    run.intoNext === true
      ? []
      : [vertical(lineEnd, y, y + hook, OTTAVA.lineWidth, color)];
  return [
    ...labels,
    horizontal(lineStart, lineEnd, y, OTTAVA.lineWidth, color),
    ...hooks,
  ];
}

/** Ottava marks of the measure: its written octave signs, and every run of notes the engraver moved by octaves. */
export function ottavaMarks(
  events: readonly VoiceEvent[],
  chords: readonly (Chord | undefined)[],
  top: number,
  color: string,
  edges: OttavaEdges,
): DrawCommand[] {
  return [
    ...writtenRuns(events, chords, edges),
    ...chosenRuns(events, chords),
  ].flatMap(run => runMarks(run, top, color, edges));
}
