import type { Rgb } from '@gp-editor/core';

const HEX_COLOR = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const CHANNEL_DIGITS = 2;
const HEX = 16;

/** "#RRGGBB" (or "RRGGBB", "#RGB") typed into a field → the colour; undefined for anything else. */
export function parseHexColor(text: string): Rgb | undefined {
  const digits = HEX_COLOR.exec(text.trim())?.[1];
  if (digits === undefined) {
    return undefined;
  }
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + CHANNEL_DIGITS), HEX));
  return r === undefined || g === undefined || b === undefined ? undefined : { r, g, b };
}

/** A colour as the custom colour field shows it: "#ED7474". */
export function hexColorText(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(HEX).padStart(CHANNEL_DIGITS, '0')).join('')}`.toUpperCase();
}

export function isSameColor(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
