import type { Annotation, AnnotationPlacement, Track } from '@gp-editor/core';
import type { MeasureLayout, RowLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import type { RowBands } from './geometry';

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

/** How far past the row's end a box may reach and still fit: the rounding of a row laid out from another x. */
const ROW_END_TOLERANCE = 0.001;

/** Lines a box draws at most (a longer note wraps into more; the panel shows it all): the last one ends with "…". */
export const MAX_BOX_LINES = 12;

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

/** The wrapped lines kept to MAX_BOX_LINES, the last one cut short with an ellipsis when some were left out. */
function boxLines(text: string): string[] {
  const lines = wrapAnnotation(text);
  if (lines.length <= MAX_BOX_LINES) {
    return lines;
  }
  const last = lines[MAX_BOX_LINES - 1] ?? '';
  const room = ANNOTATION_BOX.maxTextWidth - annotationTextWidth('…', ANNOTATION_BOX.fontSize);
  const cut = [...last].reduce((kept, character) => (fits(kept + character, room) ? kept + character : kept), '');
  return [...lines.slice(0, MAX_BOX_LINES - 1), `${cut.trimEnd()}…`];
}

export function measureAnnotation(annotation: Annotation): AnnotationBox {
  const { fontSize, lineHeight, padding } = ANNOTATION_BOX;
  const lines = boxLines(annotation.text);
  const textWidth = Math.max(0, ...lines.map((line) => annotationTextWidth(line, fontSize)));
  return { lines, width: textWidth + 2 * padding, height: lines.length * lineHeight + 2 * padding };
}

/** Room for annotations over and under a row's staves: 0 for a placement none of its bars uses. */
export interface AnnotationBands {
  readonly above: number;
  readonly below: number;
}

/**
 * One lane of boxes for each placement in `measureIndexes`: each band as tall as its tallest box with a gap either
 * side, none where no beat of those bars has an annotation there. A track's bands (for the PDF's fit): a row's own
 * may hold more lanes (annotationRowBands).
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

/** The track's bands as a row's geometry takes them (RowBands), one lane each: what the whole track needs at most in one lane. */
export function annotationTrackBands(track: Track): Pick<RowBands, 'annotationsAbove' | 'annotationsBelow'> {
  const { above, below } = annotationBands(track, track.measures.map((_, measureIndex) => measureIndex));
  return { annotationsAbove: above, annotationsBelow: below };
}

/**
 * The bands a staff's row needs for the annotations of its bars (RowBands): the boxes laid out in lanes as they are
 * drawn (annotationLanes), each band as tall as its lanes with gaps; none where no beat of the row has an annotation
 * there — a row without one keeps its height.
 */
export function annotationRowBands(track: Track | undefined, row: RowLayout): Pick<RowBands, 'annotationsAbove' | 'annotationsBelow'> {
  if (track === undefined) {
    return { annotationsAbove: 0, annotationsBelow: 0 };
  }
  let x = 0;
  const placed = row.measures.map((layout) => {
    const measure = { layout, x };
    x += layout.width;
    return measure;
  });
  const band = (placement: AnnotationPlacement) => bandHeight(annotationLanes(track, placed, placement));
  return { annotationsAbove: band('above'), annotationsBelow: band('below') };
}

/** A box and where it goes across the row. */
interface PlacedBox extends AnnotationBox {
  readonly x: number;
}

/** Boxes side by side, as tall as the tallest. */
interface Lane {
  readonly boxes: readonly PlacedBox[];
  readonly height: number;
}

/** A band of lanes: its lanes' heights with a gap before each and after the last; 0 without a box. */
function bandHeight(lanes: readonly Lane[]): number {
  return lanes.length === 0 ? 0 : lanes.reduce<number>((sum, lane) => sum + lane.height + ANNOTATION_BOX.gap, ANNOTATION_BOX.gap);
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

/**
 * The row's boxes of one placement in lanes, left to right: each box at its beat, inside the row, in the first lane where
 * it fits after the boxes already there (pushed right if need be); a box no lane has room for starts another lane.
 */
function annotationLanes(track: Track, placed: readonly RowMeasure[], placement: AnnotationPlacement): Lane[] {
  const first = placed[0];
  const last = placed.at(-1);
  if (first === undefined || last === undefined) {
    return [];
  }
  const [start, end] = [first.x, last.x + last.layout.width];
  const lanes: PlacedBox[][] = [];
  for (const box of rowBoxes(track, placed, placement)) {
    const wanted = Math.max(start, Math.min(box.x, end - box.width));
    const placedBox = lanes.reduce<PlacedBox | undefined>((found, lane) => found ?? fitInLane(lane, box, wanted, end), undefined);
    if (placedBox === undefined) {
      lanes.push([{ ...box, x: wanted }]);
    }
  }
  return lanes.map((boxes) => ({ boxes, height: Math.max(...boxes.map((box) => box.height)) }));
}

/** The box at `wanted` (or pushed right of the lane's last box) added to the lane when it fits before `end`. */
function fitInLane(lane: PlacedBox[], box: PlacedBox, wanted: number, end: number): PlacedBox | undefined {
  const previous = lane.at(-1);
  const x = previous === undefined ? wanted : Math.max(wanted, previous.x + previous.width + ANNOTATION_BOX.gap);
  if (x + box.width > end + ROW_END_TOLERANCE && previous !== undefined) {
    return undefined;
  }
  const fitted = { ...box, x };
  lane.push(fitted);
  return fitted;
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
  /** The band's edge next to the staves (the row's geometry): its bottom over them, its top under them; lanes go away from it. */
  readonly edge: number;
  readonly palette: Palette;
}

/**
 * The row's annotations of one placement as outlined boxes in the annotation colours, their lines inside, in their
 * lanes (annotationLanes). The band over the staves lies under the heading, over the directions, texts and chords: its
 * boxes hang from its bottom; the band under the staves lies before the row's gap: its boxes hang from its top.
 */
export function engraveAnnotationBand({ track, placed, placement, edge, palette }: AnnotationBandInput): DrawCommand[] {
  const { gap } = ANNOTATION_BOX;
  // Lane 0 next to the staves; each further lane farther away (up over them, down under them).
  let laneEdge = edge;
  return annotationLanes(track, placed, placement).flatMap((lane) => {
    const top = placement === 'above' ? laneEdge - gap - lane.height : laneEdge + gap;
    laneEdge = placement === 'above' ? top : top + lane.height;
    return lane.boxes.flatMap((box) => engraveBox(box, placement === 'above' ? top + lane.height - box.height : top, palette));
  });
}
