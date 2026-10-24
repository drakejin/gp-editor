/** WCAG 2's contrast between two colours ("#RRGGBB"): 1 (the same) to 21 (black on white). AA wants 4.5 for text. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text. */
export const AA_TEXT_CONTRAST = 4.5;

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function channel(value: string): number {
  const fraction = parseInt(value, 16) / 255;
  return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2's relative luminance of "#RRGGBB"; a colour written otherwise is an error (the palettes write hex only). */
export function relativeLuminance(color: string): number {
  const match = HEX_COLOR.exec(color);
  if (match === null) {
    // i18n-exempt: a programming error in a palette, never shown
    throw new RangeError(`Not a #RRGGBB colour: ${color}`);
  }
  const [, red = '0', green = '0', blue = '0'] = match;
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}
