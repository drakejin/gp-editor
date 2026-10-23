/** The tab strip under the top bar, in points. */
export const TAB_STRIP = {
  height: 28,
  minTabWidth: 120,
  maxTabWidth: 220,
} as const;

/** Every tab's width: the strip shared out evenly, from TAB_STRIP.minTabWidth to maxTabWidth (the strip then scrolls). */
export function tabWidth(stripWidth: number, tabCount: number): number {
  if (stripWidth <= 0 || tabCount <= 0) {
    return TAB_STRIP.maxTabWidth;
  }
  return Math.min(TAB_STRIP.maxTabWidth, Math.max(TAB_STRIP.minTabWidth, Math.floor(stripWidth / tabCount)));
}

/**
 * Horizontal scroll offset that brings tab `index` (tabs `width` wide, side by side) into a strip `viewportWidth` wide
 * scrolled to `scrollX`; undefined when it is already in view, or before the strip has a width.
 */
export function scrollOffsetToShowTab(index: number, width: number, scrollX: number, viewportWidth: number): number | undefined {
  if (viewportWidth <= 0 || index < 0) {
    return undefined;
  }
  const left = index * width;
  const right = left + width;
  if (left < scrollX) {
    return left;
  }
  if (right > scrollX + viewportWidth) {
    return right - viewportWidth;
  }
  return undefined;
}
