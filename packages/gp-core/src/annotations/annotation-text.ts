// A musician's annotation on the score (the app's own, no TuxGuitar counterpart): its text kept within bounds, whoever
// typed or sent it — the editor, the clipboard, a .gp file's JSON, an MCP client.
import type { Annotation, AnnotationPlacement } from '../model/song';

export const ANNOTATION_PLACEMENTS: readonly AnnotationPlacement[] = ['above', 'below'];
/** Characters an annotation keeps (a note on a part, not an essay: the box stays a box). */
export const MAX_ANNOTATION_LENGTH = 1000;
/** Lines an annotation keeps. */
export const MAX_ANNOTATION_LINES = 12;

/** Control characters but the line feed (tabs became spaces before). */
const CONTROL_CHARACTERS = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

export function isAnnotationPlacement(value: unknown): value is AnnotationPlacement {
  return ANNOTATION_PLACEMENTS.some((placement) => placement === value);
}

/**
 * The text as an annotation keeps it: \n between lines (from \r\n and \r too), tabs as spaces, no other control
 * characters, each line without spaces at its end, no blank lines or spaces before the text or after it, at most
 * MAX_ANNOTATION_LINES lines and MAX_ANNOTATION_LENGTH characters. A later line keeps the spaces it starts with (indented).
 */
export function normalizeAnnotationText(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .split('\n')
    .map((line) => line.trimEnd());
  const first = lines.findIndex((line) => line !== '');
  if (first < 0) {
    return '';
  }
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line !== '');
  return cutAt(lines.slice(first, last + 1).slice(0, MAX_ANNOTATION_LINES).join('\n').trimStart(), MAX_ANNOTATION_LENGTH).trimEnd();
}

/** At most `length` UTF-16 units, never half of a character written as two (an emoji). */
function cutAt(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }
  const lastUnit = text.charCodeAt(length - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return text.slice(0, isHighSurrogate ? length - 1 : length);
}

/** The annotation of `text` (normalized) at `placement` (above when it is no placement); undefined when nothing is left to show. */
export function toAnnotation(text: string, placement: AnnotationPlacement): Annotation | undefined {
  const normalized = normalizeAnnotationText(text);
  return normalized === '' ? undefined : { text: normalized, placement: isAnnotationPlacement(placement) ? placement : 'above' };
}

/** Both annotations show the same: same text and placement (or both none). */
export function isSameAnnotation(a: Annotation | undefined, b: Annotation | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.text === b.text && a.placement === b.placement);
}
