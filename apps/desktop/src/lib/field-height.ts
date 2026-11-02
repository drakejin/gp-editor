/** A multi-line field's line, for 13-point text, and the room above and below its text, in points. */
const LINE_HEIGHT = 17;
const PADDING = 10;
/** The fewest lines a panel's multi-line field shows: room to see a second line coming. */
export const FIELD_MIN_LINES = 2;

/**
 * The height of a panel's multi-line field showing `text`: as many lines as it holds, at least FIELD_MIN_LINES, at most
 * `maxLines` (then it scrolls), so a panel over the score takes only the room its text needs.
 */
export function growingFieldHeight(text: string, maxLines: number): number {
  const lines = text.split('\n').length;
  return Math.min(maxLines, Math.max(FIELD_MIN_LINES, lines)) * LINE_HEIGHT + PADDING;
}
