import type { Bend } from '@gp-editor/core';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';

/** The bend panel's graph, in points: positions 0–12 across, quarter tones up. */
export const BEND_GRAPH = {
  width: 320,
  height: 150,
  left: 40,
  top: 14,
  plotWidth: 264,
  plotHeight: 116,
  /** Bend positions run 0…12 across the note (TuxGuitar's units). */
  lastPosition: 12,
  dotRadius: 3.5,
  lineWidth: 2,
  gridWidth: 0.5,
  labelSize: 10,
} as const;

/** The amount in tones as Guitar Pro writes it: ¼, ½, ¾, full, 1¼ … */
export function bendAmountLabel(quarterTones: number): string {
  const whole = Math.floor(quarterTones / 4);
  const rest = ['', '¼', '½', '¾'][quarterTones % 4] ?? '';
  if (whole === 0) {
    return rest;
  }
  return whole === 1 && rest === '' ? 'full' : `${whole}${rest}`;
}

function gridLines(maxValue: number, palette: Palette): DrawCommand[] {
  const { left, top, plotWidth, plotHeight, lastPosition, gridWidth } = BEND_GRAPH;
  const columns = [0, 3, 6, 9, 12].map((position) => {
    const x = left + (position / lastPosition) * plotWidth;
    return { kind: 'line' as const, x1: x, y1: top, x2: x, y2: top + plotHeight, width: gridWidth, color: palette.chromeRaised };
  });
  const rows = Array.from({ length: maxValue + 1 }, (_, value) => {
    const y = top + plotHeight - (value / maxValue) * plotHeight;
    return { kind: 'line' as const, x1: left, y1: y, x2: left + plotWidth, y2: y, width: gridWidth, color: palette.chromeRaised };
  });
  const labels = [Math.ceil(maxValue / 2), maxValue].map((value) => ({
    kind: 'text' as const,
    x: left - 6,
    y: top + plotHeight - (value / maxValue) * plotHeight,
    text: bendAmountLabel(value),
    size: BEND_GRAPH.labelSize,
    color: palette.chromeMuted,
    font: 'ui' as const,
    align: 'right' as const,
  }));
  return [...columns, ...rows, ...labels];
}

/** The bend panel's graph: a grid up to `maxValue` quarter tones and the bend's curve with a dot on each point. */
export function engraveBendGraph(bend: Bend | undefined, maxValue: number, palette: Palette): DrawCommand[] {
  const { left, top, plotWidth, plotHeight, lastPosition } = BEND_GRAPH;
  const scale = Math.max(1, maxValue);
  const at = (position: number, value: number) => ({ x: left + (position / lastPosition) * plotWidth, y: top + plotHeight - (value / scale) * plotHeight });
  const points = (bend?.points ?? []).map((point) => at(point.position, point.value));
  const segments: DrawCommand[] = points.slice(1).map((point, index) => {
    const from = points[index] ?? point;
    return { kind: 'line', x1: from.x, y1: from.y, x2: point.x, y2: point.y, width: BEND_GRAPH.lineWidth, color: palette.chromeAccent };
  });
  const dots: DrawCommand[] = points.map((point) => ({ kind: 'circle', x: point.x, y: point.y, radius: BEND_GRAPH.dotRadius, color: palette.chromeText }));
  return [...gridLines(scale, palette), ...segments, ...dots];
}

/** The vibrato panel's preview: a flat line, a slight wave or a wide one. */
export const VIBRATO_PREVIEW = { width: 160, height: 36, period: 16, amplitudes: { none: 0, slight: 3, wide: 8 }, steps: 4 } as const;

export function engraveVibratoPreview(kind: keyof typeof VIBRATO_PREVIEW.amplitudes, palette: Palette): DrawCommand[] {
  const { width, height, period, amplitudes, steps } = VIBRATO_PREVIEW;
  const amplitude = amplitudes[kind];
  const count = Math.floor(width / (period / steps));
  const y = (x: number) => height / 2 - amplitude * Math.sin((2 * Math.PI * x) / period);
  return Array.from({ length: count }, (_, index) => {
    const x1 = (index * period) / steps;
    const x2 = ((index + 1) * period) / steps;
    return { kind: 'line', x1, y1: y(x1), x2, y2: y(x2), width: kind === 'wide' ? 2.2 : 1.6, color: palette.chromeText } as const;
  });
}
