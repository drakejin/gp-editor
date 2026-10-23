import { type Beat, type DynamicName, type Measure, dynamicOf } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand, TextCommand } from './draw';
import { inkBottom } from './ink';
import { DYNAMIC_GLYPHS, type MusicGlyph, staffSpace } from './symbols/smufl';

/**
 * Dynamics as Guitar Pro shows them: a mark (p, mf, ff …) under the beat where the track's dynamic changes from the
 * note played before it, nothing while it stays the same. Velocities are a note's; a beat takes its loudest note's.
 */

/** Every track starts at forte, Guitar Pro's default velocity: a first note at f gets no mark. */
export const START_DYNAMIC: DynamicName = 'f';

/** Size of the marks (one em = four staff spaces), as the tab's marks. */
export const DYNAMIC_MUSIC_SIZE = 24;

export interface DynamicMark {
  readonly beatIndex: number;
  readonly dynamic: DynamicName;
}

/** The dynamic a beat is played at: its loudest struck note's; undefined for a rest or a beat of tied notes only. */
export function beatDynamic(beat: Beat): DynamicName | undefined {
  const velocities = beat.voices.flatMap((voice) => voice.notes.filter((note) => !note.isTied).map((note) => note.velocity));
  return velocities.length === 0 ? undefined : dynamicOf(Math.max(...velocities));
}

/** The dynamic in force where measure `measureIndex` starts: the last struck beat's before it, else START_DYNAMIC. */
export function dynamicBefore(measures: readonly Measure[], measureIndex: number): DynamicName {
  for (let m = Math.min(measureIndex, measures.length) - 1; m >= 0; m--) {
    const beats = measures[m]?.beats ?? [];
    for (let b = beats.length - 1; b >= 0; b--) {
      const beat = beats[b];
      const dynamic = beat === undefined ? undefined : beatDynamic(beat);
      if (dynamic !== undefined) {
        return dynamic;
      }
    }
  }
  return START_DYNAMIC;
}

/** The beats of a measure where the dynamic changes, with the dynamic they change to. */
export function dynamicMarks(measures: readonly Measure[], measureIndex: number): DynamicMark[] {
  const beats = measures[measureIndex]?.beats ?? [];
  const start = { current: dynamicBefore(measures, measureIndex), marks: [] as readonly DynamicMark[] };
  return [
    ...beats.reduce((state, beat, beatIndex) => {
      const dynamic = beatDynamic(beat);
      return dynamic === undefined || dynamic === state.current ? state : { current: dynamic, marks: [...state.marks, { beatIndex, dynamic }] };
    }, start).marks,
  ];
}

/** Whether any beat of the track changes dynamic or is under a hairpin: only then do its rows make room for the marks. */
export function hasDynamicChanges(measures: readonly Measure[]): boolean {
  if (measures.some((measure) => measure.beats.some((beat) => beat.hairpin !== undefined))) {
    return true;
  }
  const played = measures.flatMap((measure) => measure.beats.flatMap((beat) => beatDynamic(beat) ?? []));
  return played.some((dynamic, i) => dynamic !== (played[i - 1] ?? START_DYNAMIC));
}

/** Under a staff, the marks keep these distances (points) from its bottom line and from the notes' ink. */
export const DYNAMIC_PLACEMENT = {
  staffGap: 12,
  inkGap: 5,
  /** The italic letters lean out of the glyph's advance by about this much (staff spaces) on the left. */
  lean: 0.6,
} as const;

/** A staff the marks go under: as close as its notes allow, never lower than the band's baseline. */
export interface DynamicsStaff {
  /** What the staff drew in the measure (measure-local), for the notes' ink. */
  readonly commands: readonly DrawCommand[];
  readonly bottomLine: number;
}

export interface DynamicsContext {
  /** The track's measures: the dynamic before this measure is found in them. */
  readonly measures: readonly Measure[];
  readonly measureIndex: number;
  readonly layout: MeasureLayout;
  /** Baseline of the marks in their band: where they go without a staff, and the lowest they go under one. */
  readonly y: number;
  readonly palette: Palette;
  readonly staff?: DynamicsStaff;
}

/** A mark's baseline: under the staff and clear of the ink above its columns, else on the band's baseline. */
function markBaseline(context: DynamicsContext, glyph: MusicGlyph, x: number): number {
  const { staff, y } = context;
  if (staff === undefined) {
    return y;
  }
  const space = staffSpace(DYNAMIC_MUSIC_SIZE);
  const half = (glyph.advance / 2 + DYNAMIC_PLACEMENT.lean) * space;
  const ink = inkBottom(staff.commands, x - half, x + half) ?? staff.bottomLine;
  const top = Math.max(staff.bottomLine + DYNAMIC_PLACEMENT.staffGap, ink + DYNAMIC_PLACEMENT.inkGap);
  return Math.min(y, top + glyph.top * space);
}

/** The measure's dynamic marks, each centred under its beat (measure-local coordinates). */
export function engraveDynamics(context: DynamicsContext): TextCommand[] {
  const { layout, palette } = context;
  return dynamicMarks(context.measures, context.measureIndex).flatMap((mark): TextCommand[] => {
    const beat = layout.beats.find((b) => b.beatIndex === mark.beatIndex);
    const glyph = DYNAMIC_GLYPHS[mark.dynamic];
    if (beat === undefined) {
      return [];
    }
    const y = markBaseline(context, glyph, beat.x);
    return [{ kind: 'text', x: beat.x, y, text: glyph.text, size: DYNAMIC_MUSIC_SIZE, color: palette.text, font: 'music', align: 'center' }];
  });
}
