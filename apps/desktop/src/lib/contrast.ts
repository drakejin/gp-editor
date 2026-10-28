/** WCAG 2's contrast between two colours ("#RRGGBB"): 1 (the same) to 21 (black on white). AA wants 4.5 for text. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text. */
export const AA_TEXT_CONTRAST = 4.5;

/**
 * A colour difference (CIE76 ΔE*ab) two marks that mean different things keep at least: clearly two colours at a glance,
 * not two shades of one (Design Mode's orange and red handles were 17–23 apart).
 */
export const DISTINCT_COLOR_DIFFERENCE = 40;

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function channel(value: string): number {
  const fraction = parseInt(value, 16) / 255;
  return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
}

/** The sRGB channels of "#RRGGBB", linear, 0–1. */
function linearChannels(color: string): readonly [number, number, number] {
  const match = HEX_COLOR.exec(color);
  if (match === null) {
    // i18n-exempt: a programming error in a palette, never shown
    throw new RangeError(`Not a #RRGGBB colour: ${color}`);
  }
  const [, red = '0', green = '0', blue = '0'] = match;
  return [channel(red), channel(green), channel(blue)];
}

/** CIELAB's f: the cube root, linear near black. */
function labCurve(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : ((24389 / 27) * value + 16) / 116;
}

/** "#RRGGBB" in CIELAB (D65 white). */
function toLab(color: string): readonly [number, number, number] {
  const [r, g, b] = linearChannels(color);
  const x = labCurve((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = labCurve(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = labCurve((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How far apart two colours look (CIE76 ΔE*ab): 0 for the same, 100 for black and white. */
export function colorDifference(first: string, second: string): number {
  const [l1, a1, b1] = toLab(first);
  const [l2, a2, b2] = toLab(second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** WCAG 2's relative luminance of "#RRGGBB"; a colour written otherwise is an error (the palettes write hex only). */
export function relativeLuminance(color: string): number {
  const [red, green, blue] = linearChannels(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
