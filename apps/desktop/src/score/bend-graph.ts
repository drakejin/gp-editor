import type { Palette } from '../theme';
import type { DrawCommand } from './draw';

/** The amount in tones as Guitar Pro writes it: ¼, ½, ¾, full, 1¼ … */
export function bendAmountLabel(quarterTones: number): string {
  const whole = Math.floor(quarterTones / 4);
  const rest = ['', '¼', '½', '¾'][quarterTones % 4] ?? '';
  if (whole === 0) {
    return rest;
  }
  return whole === 1 && rest === '' ? 'full' : `${whole}${rest}`;
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
