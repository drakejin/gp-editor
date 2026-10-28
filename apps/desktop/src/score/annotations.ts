import type { Annotation, AnnotationPlacement, Track } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';

/** An annotation's box (a musician's note on the score), in layout points. */
export const ANNOTATION_BOX = {
  fontSize: 10,
  lineHeight: 13,
  /** Inside the box, around its lines. */
  padding: 4,
  /** A line wider than this wraps. */
  maxTextWidth: 170,
  radius: 3,
  /** The outline, in the annotation ink. */
  border: 1,
  /** The box starts this far left of its beat, as a free text does over the fret. */
  inset: 4,
  /** Between boxes side by side, and between the boxes and the band's edges. */
  gap: 4,
} as const;

/** How far (CIE76 ΔE) an annotation's box is tinted from the paper: seen at a glance (theme-contrast test). */
export const ANNOTATION_TINT_DIFFERENCE = 25;

/** A narrow character's advance in ems (a little over the score's labels' estimate, so a box never cuts its text). */
const NARROW_CHARACTER = 0.6;
/** Hangul, kana and CJK ideographs, full-width forms and emoji: a full em. */
const WIDE_CHARACTERS: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

/** The box's colours: the palette's annotation fill and ink (its sidebar and text when it has none). */
export function annotationColors(palette: Palette): { readonly fill: string; readonly ink: string } {
  return { fill: palette.annotationFill ?? palette.sidebar, ink: palette.annotationInk ?? palette.text };
}

function isWide(codePoint: number): boolean {
  return WIDE_CHARACTERS.some(([first, last]) => codePoint >= first && codePoint <= last);
}

/** Estimated advance of a line in the system font: wide characters a full em, the others NARROW_CHARACTER. */
export function annotationTextWidth(text: string, size: number): number {
  let ems = 0;
  for (const character of text) {
    ems += isWide(character.codePointAt(0) ?? 0) ? 1 : NARROW_CHARACTER;
  }
  return ems * size;
}

const fits = (text: string, maxWidth: number) => annotationTextWidth(text, ANNOTATION_BOX.fontSize) <= maxWidth;

/** A word wider than `maxWidth` cut into pieces that fit, character by character (never inside a character). */
function breakWord(word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece !== '' && !fits(piece + character, maxWidth)) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  return [...pieces, piece];
}

/** One typed line wrapped between words to `maxWidth`, its words too wide broken. */
function wrapLine(line: string, maxWidth: number): string[] {
  if (fits(line, maxWidth)) {
    return [line];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of line.split(' ').flatMap((part) => (fits(part, maxWidth) ? [part] : breakWord(part, maxWidth)))) {
    const joined = current === '' ? word : `${current} ${word}`;
    if (current !== '' && !fits(joined, maxWidth)) {
      lines.push(current);
      current = word;
    } else {
      current = joined;
    }
  }
  return [...lines, current];
}

/** The lines the box shows: the typed lines, each wrapped to `maxWidth`. */
export function wrapAnnotation(text: string, maxWidth: number = ANNOTATION_BOX.maxTextWidth): string[] {
  return text.split('\n').flatMap((line) => wrapLine(line, maxWidth));
}

/** An annotation's box: its lines, width and height (padding included). */
export interface AnnotationBox {
  readonly lines: readonly string[];
  readonly width: number;
  readonly height: number;
}

export function measureAnnotation(annotation: Annotation): AnnotationBox {
  const { fontSize, lineHeight, padding } = ANNOTATION_BOX;
  const lines = wrapAnnotation(annotation.text);
  const textWidth = Math.max(0, ...lines.map((line) => annotationTextWidth(line, fontSize)));
  return { lines, width: textWidth + 2 * padding, height: lines.length * lineHeight + 2 * padding };
}

/** Room for annotations over and under a row's staves: 0 for a placement none of its bars uses. */
export interface AnnotationBands {
  readonly above: number;
  readonly below: number;
}

/**
 * The bands a staff's row needs for the annotations of its bars (`measureIndexes`): each as tall as its tallest box
 * with a gap either side, none where no beat of those bars has an annotation there — a row without one keeps its height.
 */
export function annotationBands(track: Track | undefined, measureIndexes: readonly number[]): AnnotationBands {
  const heights = { above: 0, below: 0 };
  for (const measureIndex of measureIndexes) {
    for (const beat of track?.measures[measureIndex]?.beats ?? []) {
      if (beat.annotation !== undefined) {
        heights[beat.annotation.placement] = Math.max(heights[beat.annotation.placement], measureAnnotation(beat.annotation).height);
      }
    }
  }
  const band = (height: number) => (height === 0 ? 0 : height + 2 * ANNOTATION_BOX.gap);
  return { above: band(heights.above), below: band(heights.below) };
}

/** A box and where it goes across the row. */
interface PlacedBox extends AnnotationBox {
  readonly x: number;
}

/** A measure of the row with its x (row.ts' PlacedMeasure). */
interface RowMeasure {
  readonly layout: MeasureLayout;
  readonly x: number;
}

/** The row's annotations of `placement`, left to right, each box at its beat's x (less the inset). */
function rowBoxes(track: Track, placed: readonly RowMeasure[], placement: AnnotationPlacement): PlacedBox[] {
  return placed.flatMap(({ layout, x }) =>
    layout.beats.flatMap(({ beatIndex, x: beatX }) => {
      const annotation = track.measures[layout.measureIndex]?.beats[beatIndex]?.annotation;
      return annotation === undefined || annotation.placement !== placement ? [] : [{ ...measureAnnotation(annotation), x: x + beatX - ANNOTATION_BOX.inset }];
    }),
  );
}

/** Boxes kept apart (each pushed right of the one before) and inside [start, end] (pulled back left from the end). */
function spreadBoxes(boxes: readonly PlacedBox[], start: number, end: number): PlacedBox[] {
  const { gap } = ANNOTATION_BOX;
  const pushed = boxes.reduce<PlacedBox[]>((done, box) => {
    const previous = done.at(-1);
    return [...done, { ...box, x: Math.max(box.x, start, previous === undefined ? start : previous.x + previous.width + gap) }];
  }, []);
  const pulled: PlacedBox[] = [];
  for (let index = pushed.length - 1; index >= 0; index--) {
    const box = pushed[index] as PlacedBox;
    const limit = pulled[0] === undefined ? end : pulled[0].x - gap;
    pulled.unshift({ ...box, x: Math.max(start, Math.min(box.x, limit - box.width)) });
  }
  return pulled;
}

function engraveBox(box: PlacedBox, y: number, palette: Palette): DrawCommand[] {
  const { fill, ink } = annotationColors(palette);
  const { border, radius, padding, lineHeight, fontSize } = ANNOTATION_BOX;
  return [
    { kind: 'rect', x: box.x, y, width: box.width, height: box.height, color: ink, radius },
    { kind: 'rect', x: box.x + border, y: y + border, width: box.width - 2 * border, height: box.height - 2 * border, color: fill, radius: radius - border },
    ...box.lines.map((line, index): DrawCommand => ({
      kind: 'text', x: box.x + padding, y: y + padding + (index + 0.5) * lineHeight, text: line, size: fontSize, color: ink, font: 'ui', align: 'left',
    })),
  ];
}

export interface AnnotationBandInput {
  readonly track: Track;
  /** The row's measures with their x (row.ts' placeRow). */
  readonly placed: readonly RowMeasure[];
  readonly placement: AnnotationPlacement;
  /** The band's top and height (the row's geometry). */
  readonly top: number;
  readonly height: number;
  readonly palette: Palette;
}

/**
 * The row's annotations of one placement as outlined boxes in the annotation colours, their lines inside: over the
 * staves they hang from the band's bottom (near the staff), under them from its top.
 */
export function engraveAnnotationBand({ track, placed, placement, top, height, palette }: AnnotationBandInput): DrawCommand[] {
  const first = placed[0];
  const last = placed.at(-1);
  const boxes = rowBoxes(track, placed, placement);
  if (first === undefined || last === undefined || boxes.length === 0) {
    return [];
  }
  const { gap } = ANNOTATION_BOX;
  return spreadBoxes(boxes, first.x, last.x + last.layout.width).flatMap((box) =>
    engraveBox(box, placement === 'above' ? top + height - gap - box.height : top + gap, palette),
  );
}
