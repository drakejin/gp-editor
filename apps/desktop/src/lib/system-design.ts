import type { MeasureHeader, Track } from '@gp-editor/core';
import { type MeasureLayout, justifyScale, stretchMeasure } from './layout';

/** How the bars break into systems besides their widths: the stylesheet's bars per system and Design Mode's bars. */
export interface SystemRules {
  /** The most bars a system holds (Stylesheet ▸ Systems & Staves); 0 = as many as fit. */
  readonly barsPerSystem: number;
  /** The song's measure headers: a bar's Design Mode system start (`design.systemBars`) and width (`design.widthScale`). */
  readonly headers?: readonly MeasureHeader[];
}

export const NO_SYSTEM_RULES: SystemRules = { barsPerSystem: 0 };

/** The closest a fixed system moves its beats together, as a share of their natural distance (as squeezeRow). */
const MIN_COMPRESSION = 0.25;

/** One system: how many bars, and whether Design Mode fixed that number (it holds them even when they do not fit). */
export interface SystemSpan {
  readonly count: number;
  readonly isFixed: boolean;
}

/**
 * The bars' systems: greedy line breaking by width (each system's room: `firstRowWidth` for the first), at most the
 * stylesheet's bars per system, and a new system wherever Design Mode starts one — holding the number of bars it was
 * given whatever their widths (0: as many as fit). Without rules this is breakRows.
 */
export function breakSystems(widths: readonly number[], rules: SystemRules, availableWidth: number, firstRowWidth = availableWidth): SystemSpan[] {
  const startsSystem = (index: number) => rules.headers?.[index]?.design?.systemBars !== undefined;
  const spans: SystemSpan[] = [];
  let index = 0;
  while (index < widths.length) {
    const start = index;
    const designed = rules.headers?.[start]?.design?.systemBars ?? 0;
    const isFixed = designed > 0;
    const limit = isFixed ? designed : rules.barsPerSystem > 0 ? rules.barsPerSystem : Infinity;
    const room = spans.length === 0 ? firstRowWidth : availableWidth;
    let width = widths[index] ?? 0;
    index += 1;
    while (index < widths.length && index - start < limit && !startsSystem(index) && (isFixed || width + (widths[index] ?? 0) <= room)) {
      width += widths[index] ?? 0;
      index += 1;
    }
    spans.push({ count: index - start, isFixed });
  }
  return spans;
}

/** From a bar's first beat to its last, over all its staves (they share their columns). */
function beatSpan(staves: readonly MeasureLayout[]): { readonly anchor: number; readonly spread: number } {
  const firsts = staves.flatMap((measure) => (measure.beats[0] === undefined ? [] : [measure.beats[0].x]));
  const lasts = staves.flatMap((measure) => (measure.beats.length === 0 ? [] : [measure.beats[measure.beats.length - 1]?.x ?? 0]));
  if (firsts.length === 0) {
    return { anchor: 0, spread: 0 };
  }
  const anchor = Math.min(...firsts);
  return { anchor, spread: Math.max(...lasts) - anchor };
}

/** A fixed system too wide for its room: every bar's beats moved closer (the room before and after them kept), alike on every staff. */
function compressBars(bars: readonly (readonly MeasureLayout[])[], width: number): MeasureLayout[][] {
  const natural = bars.reduce((sum, staves) => sum + (staves[0]?.width ?? 0), 0);
  const spans = bars.map(beatSpan);
  const spread = spans.reduce((sum, span) => sum + span.spread, 0);
  if (spread <= 0) {
    return bars.map((staves) => [...staves]);
  }
  const k = Math.max(MIN_COMPRESSION, 1 - (natural - width) / spread);
  return bars.map((staves, i) => {
    const { anchor, spread: barSpread } = spans[i] ?? { anchor: 0, spread: 0 };
    return staves.map((measure) => ({
      ...measure,
      width: measure.width - barSpread * (1 - k),
      beats: measure.beats.map((beat) => ({ ...beat, x: anchor + (beat.x - anchor) * k })),
    }));
  });
}

/**
 * A system's bars (`bars[i]` = bar `firstIndex + i` on every staff) fitted to `width`, as layoutRows justifies a row:
 * stretched to the width (the last system only when mostly full), each bar in proportion to its Design Mode width; a
 * fixed system too wide for the room squeezed into it. Without a bar of other width this is layoutRows' justification.
 */
export function fitSystem(bars: readonly (readonly MeasureLayout[])[], firstIndex: number, span: SystemSpan, width: number, isLastRow: boolean, rules: SystemRules): MeasureLayout[][] {
  const reference = bars.flatMap((staves) => (staves[0] === undefined ? [] : [staves[0]]));
  const natural = reference.reduce((sum, measure) => sum + measure.width, 0);
  if (span.isFixed && natural > width) {
    return compressBars(bars, width);
  }
  const scale = justifyScale(reference, width, isLastRow);
  const weights = bars.map((_, i) => rules.headers?.[firstIndex + i]?.design?.widthScale ?? 1);
  if (weights.every((weight) => weight === 1)) {
    return bars.map((staves) => staves.map((measure) => (scale === undefined ? measure : stretchMeasure(measure, scale))));
  }
  if (scale === undefined && natural > width) {
    return bars.map((staves) => [...staves]);
  }
  const weighted = bars.reduce((sum, staves, i) => sum + (staves[0]?.width ?? 0) * (weights[i] ?? 1), 0);
  const fill = scale === undefined ? Math.min(1, width / weighted) : width / weighted;
  return bars.map((staves, i) => staves.map((measure) => stretchMeasure(measure, (weights[i] ?? 1) * fill)));
}

/** The track's bar with its beats moved as Design Mode moved them (by their start in the bar), kept inside the bar. */
export function withBeatOffsets(measure: MeasureLayout, track: Track | undefined, header: MeasureHeader | undefined): MeasureLayout {
  const offsets = header?.design?.beatOffsets;
  const beats = track?.measures[measure.measureIndex]?.beats;
  if (offsets === undefined || beats === undefined || header === undefined) {
    return measure;
  }
  return {
    ...measure,
    beats: measure.beats.map((placed) => {
      const at = (beats[placed.beatIndex]?.start ?? header.start) - header.start;
      const offset = offsets.find((candidate) => candidate.at === at)?.offset ?? 0;
      return offset === 0 ? placed : { ...placed, x: Math.min(measure.width, Math.max(0, placed.x + offset)) };
    }),
  };
}
