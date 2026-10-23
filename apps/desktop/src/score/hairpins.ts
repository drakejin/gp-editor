import type { Beat, Hairpin, Measure } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { LineCommand } from './draw';
import { DYNAMIC_MUSIC_SIZE, dynamicMarks } from './dynamics';
import { DYNAMIC_GLYPHS, staffSpace } from './symbols/smufl';

/**
 * Crescendo and decrescendo wedges in the dynamics band, across the beats they span (a wedge going on into the next
 * bar opens or closes across the bar line), clear of the dynamic marks at their ends.
 */

const WEDGE = {
  /** The widest opening, at the loud end. */
  opening: 9,
  /** The wedge's middle sits this far above the dynamics' baseline. */
  raise: 4,
  gap: 3,
  lineWidth: 1,
} as const;

export interface HairpinsContext {
  readonly measures: readonly Measure[];
  readonly measureIndex: number;
  readonly layout: MeasureLayout;
  /** The dynamics' baseline. */
  readonly y: number;
  readonly palette: Palette;
}

function beatAt(measures: readonly Measure[], measureIndex: number, beatIndex: number): Beat | undefined {
  return measures[measureIndex]?.beats[beatIndex];
}

/** Beats with `hairpin` right before the measure, walking back across bar lines. */
function countBefore(measures: readonly Measure[], measureIndex: number, hairpin: Hairpin): number {
  let count = 0;
  for (let m = measureIndex - 1; m >= 0; m--) {
    const beats = measures[m]?.beats ?? [];
    for (let b = beats.length - 1; b >= 0; b--) {
      if (beats[b]?.hairpin !== hairpin) {
        return count;
      }
      count += 1;
    }
  }
  return count;
}

/** Beats with `hairpin` right after the measure. */
function countAfter(measures: readonly Measure[], measureIndex: number, hairpin: Hairpin): number {
  let count = 0;
  for (let m = measureIndex + 1; m < measures.length; m++) {
    for (const beat of measures[m]?.beats ?? []) {
      if (beat.hairpin !== hairpin) {
        return count;
      }
      count += 1;
    }
  }
  return count;
}

interface Run {
  readonly hairpin: Hairpin;
  /** Positions in layout order. */
  readonly first: number;
  readonly last: number;
}

function runsOf(context: HairpinsContext): Run[] {
  const { layout, measures, measureIndex } = context;
  return layout.beats.reduce<Run[]>((runs, beatLayout, position) => {
    const hairpin = beatAt(measures, measureIndex, beatLayout.beatIndex)?.hairpin;
    const previous = runs[runs.length - 1];
    if (hairpin === undefined) {
      return runs;
    }
    return previous !== undefined && previous.hairpin === hairpin && previous.last === position - 1
      ? [...runs.slice(0, -1), { ...previous, last: position }]
      : [...runs, { hairpin, first: position, last: position }];
  }, []);
}

/** Half the width of the dynamic mark under a beat, or 0. */
function markHalfWidth(context: HairpinsContext, beatIndex: number | undefined): number {
  const mark = dynamicMarks(context.measures, context.measureIndex).find((candidate) => candidate.beatIndex === beatIndex);
  return mark === undefined ? 0 : (DYNAMIC_GLYPHS[mark.dynamic].advance * staffSpace(DYNAMIC_MUSIC_SIZE)) / 2;
}

/** The two lines of one run's piece of wedge in this measure. */
function wedge(context: HairpinsContext, run: Run): LineCommand[] {
  const { layout, measures, measureIndex, palette } = context;
  const before = run.first === 0 ? countBefore(measures, measureIndex, run.hairpin) : 0;
  const after = run.last === layout.beats.length - 1 ? countAfter(measures, measureIndex, run.hairpin) : 0;
  const total = before + run.last - run.first + 1 + after;
  const firstBeat = layout.beats[run.first];
  const nextBeat = layout.beats[run.last + 1];
  const x1 = before > 0 ? 0 : (firstBeat?.x ?? 0) + markHalfWidth(context, firstBeat?.beatIndex) + WEDGE.gap;
  const x2 = after > 0 ? layout.width : (nextBeat?.x ?? layout.width) - markHalfWidth(context, nextBeat?.beatIndex) - WEDGE.gap;
  const share = (beats: number) => (run.hairpin === 'crescendo' ? beats / total : 1 - beats / total);
  const open1 = (WEDGE.opening * share(before)) / 2;
  const open2 = (WEDGE.opening * share(before + run.last - run.first + 1)) / 2;
  const y = context.y - WEDGE.raise;
  const line = (side: number): LineCommand => ({ kind: 'line', x1, y1: y + side * open1, x2, y2: y + side * open2, width: WEDGE.lineWidth, color: palette.text });
  return x2 > x1 ? [line(-1), line(1)] : [];
}

/** The measure's crescendo and decrescendo wedges (measure-local coordinates). */
export function engraveHairpins(context: HairpinsContext): LineCommand[] {
  return runsOf(context).flatMap((run) => wedge(context, run));
}
