import { type Annotation, type Song, setBeatAnnotation } from '@gp-editor/core';
import type { MeasureLayout } from '../src/lib/layout';
import {
  ANNOTATION_BOX,
  annotationBands,
  annotationColors,
  annotationTextWidth,
  engraveAnnotationBand,
  measureAnnotation,
  wrapAnnotation,
} from '../src/score/annotations';
import type { DrawCommand, RectCommand, TextCommand } from '../src/score/draw';
import { PALETTE, allFinite, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const at = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0 });

/** Three bars of four quarters. */
function quarters(): Song {
  const bar = (first: number) => [0, 1, 2, 3].map((i) => beat(first + i * 960, [note(1, i)]));
  return makeSong([bar(960), bar(4800), bar(8640)]);
}

function annotate(song: Song, measureIndex: number, beatIndex: number, annotation: Annotation): Song {
  return setBeatAnnotation(song, at(measureIndex, beatIndex), annotation);
}

const layout = (measureIndex: number, width = 200): MeasureLayout => ({
  measureIndex,
  width,
  beats: [0, 1, 2, 3].map((beatIndex) => ({ beatIndex, x: 20 + beatIndex * 45 })),
  showTimeSignature: false,
  showTempo: false,
  showTripletFeel: false,
});

const rects = (commands: readonly DrawCommand[]): RectCommand[] => commands.filter((command): command is RectCommand => command.kind === 'rect');

describe('annotationColors', () => {
  it('takes the palette’s annotation colours, else its sidebar and text', () => {
    expect(annotationColors({ ...PALETTE, annotationFill: '#FFF0B0', annotationInk: '#5C4300' })).toEqual({ fill: '#FFF0B0', ink: '#5C4300' });
    expect(annotationColors(PALETTE)).toEqual({ fill: PALETTE.sidebar, ink: PALETTE.text });
  });
});

describe('annotationTextWidth', () => {
  it('counts Hangul, CJK and emoji a full em wide, other letters narrower', () => {
    const size = ANNOTATION_BOX.fontSize;
    expect(annotationTextWidth('숨', size)).toBeCloseTo(size, 5);
    expect(annotationTextWidth('音', size)).toBeCloseTo(size, 5);
    expect(annotationTextWidth('🎵', size)).toBeCloseTo(size, 5);
    expect(annotationTextWidth('a', size)).toBeLessThan(size * 0.7);
    expect(annotationTextWidth('여기서', size)).toBeGreaterThan(annotationTextWidth('abc', size) * 1.5);
  });
});

describe('wrapAnnotation', () => {
  it('keeps the lines typed, and wraps a long one between words', () => {
    // Arrange
    const long = 'play this phrase softly and let the last chord ring until the next section starts';

    // Act
    const lines = wrapAnnotation(`Intro\n${long}`, 120);

    // Assert
    expect(lines[0]).toBe('Intro');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.slice(1).join(' ')).toBe(long);
    expect(lines.every((line) => annotationTextWidth(line, ANNOTATION_BOX.fontSize) <= 120)).toBe(true);
  });

  it('breaks a word, or a Korean line without spaces, that is wider than the box', () => {
    const lines = wrapAnnotation('여기서부터는아주작게연주하고마지막에크게', 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('여기서부터는아주작게연주하고마지막에크게');
    expect(lines.every((line) => annotationTextWidth(line, ANNOTATION_BOX.fontSize) <= 60)).toBe(true);
  });

  it('keeps an empty line between two lines', () => {
    expect(wrapAnnotation('a\n\nb', 100)).toEqual(['a', '', 'b']);
  });
});

describe('measureAnnotation', () => {
  it('is as wide as its widest line and as tall as its lines, with the padding', () => {
    // Act
    const one = measureAnnotation({ text: 'slow', placement: 'above' });
    const three = measureAnnotation({ text: 'one\ntwo\nthree', placement: 'above' });

    // Assert
    const { padding, lineHeight, fontSize } = ANNOTATION_BOX;
    expect(one.height).toBe(lineHeight + 2 * padding);
    expect(three.height).toBe(3 * lineHeight + 2 * padding);
    expect(one.width).toBeCloseTo(annotationTextWidth('slow', fontSize) + 2 * padding, 5);
    expect(three.width).toBeCloseTo(annotationTextWidth('three', fontSize) + 2 * padding, 5);
  });
});

describe('annotationBands', () => {
  it('is no room for bars without annotations', () => {
    const track = quarters().tracks[0];
    expect(annotationBands(track, [0, 1, 2])).toEqual({ above: 0, below: 0 });
    expect(annotationBands(undefined, [0])).toEqual({ above: 0, below: 0 });
  });

  it('makes each band as tall as its tallest box, only for the bars asked about', () => {
    // Arrange
    const song = annotate(annotate(annotate(quarters(), 0, 1, { text: 'a', placement: 'above' }), 0, 3, { text: 'b\nc', placement: 'above' }), 2, 0, { text: 'd', placement: 'below' });
    const track = song.tracks[0];
    const { gap } = ANNOTATION_BOX;

    // Act
    const first = annotationBands(track, [0]);
    const middle = annotationBands(track, [1]);
    const all = annotationBands(track, [0, 1, 2]);

    // Assert
    expect(first).toEqual({ above: measureAnnotation({ text: 'b\nc', placement: 'above' }).height + 2 * gap, below: 0 });
    expect(middle).toEqual({ above: 0, below: 0 });
    expect(all.below).toBe(measureAnnotation({ text: 'd', placement: 'below' }).height + 2 * gap);
  });
});

describe('engraveAnnotationBand', () => {
  const song = annotate(annotate(quarters(), 0, 1, { text: 'Watch the bend', placement: 'above' }), 1, 0, { text: 'two\nlines', placement: 'below' });
  const track = song.tracks[0]!;
  const placed = [{ layout: layout(0), x: 40 }, { layout: layout(1), x: 240 }];
  const band = (placement: 'above' | 'below', height = 60, top = 10) =>
    engraveAnnotationBand({ track, placed, placement, top, height, palette: { ...PALETTE, annotationFill: '#FFF0B0', annotationInk: '#5C4300' } });

  it('draws each annotation of its placement as an outlined box at its beat, its lines in the annotation ink', () => {
    // Act
    const above = band('above');

    // Assert
    const [outline, fill] = rects(above);
    expect(outline).toMatchObject({ color: '#5C4300', x: 40 + 20 + 45 - ANNOTATION_BOX.inset });
    expect(fill).toMatchObject({ color: '#FFF0B0', x: (outline?.x ?? 0) + ANNOTATION_BOX.border });
    expect(texts(above).map((text: TextCommand) => [text.text, text.color, text.align])).toEqual([['Watch the bend', '#5C4300', 'left']]);
    expect(allFinite(above)).toBe(true);
  });

  it('hangs the boxes over the staves from the band’s bottom, and under them from its top', () => {
    // Act
    const [aboveBox] = rects(band('above', 60, 10));
    const [belowBox] = rects(band('below', 60, 300));

    // Assert
    expect((aboveBox?.y ?? 0) + (aboveBox?.height ?? 0)).toBe(10 + 60 - ANNOTATION_BOX.gap);
    expect(belowBox?.y).toBe(300 + ANNOTATION_BOX.gap);
    expect(texts(band('below')).map((text) => text.text)).toEqual(['two', 'lines']);
  });

  it('keeps boxes side by side apart, and inside the row', () => {
    // Arrange: long annotations on two neighbouring beats of the last bar.
    const crowded = annotate(annotate(quarters(), 1, 2, { text: 'a long annotation here', placement: 'above' }), 1, 3, { text: 'and another long one', placement: 'above' });
    const commands = engraveAnnotationBand({ track: crowded.tracks[0]!, placed, placement: 'above', top: 0, height: 40, palette: PALETTE });

    // Act
    const [first, , second] = rects(commands);

    // Assert
    expect((second?.x ?? 0)).toBeGreaterThanOrEqual((first?.x ?? 0) + (first?.width ?? 0) + ANNOTATION_BOX.gap);
    expect((second?.x ?? 0) + (second?.width ?? 0)).toBeLessThanOrEqual(240 + 200);
  });

  it('draws nothing for a placement without annotations', () => {
    const plain = quarters().tracks[0]!;
    expect(engraveAnnotationBand({ track: plain, placed, placement: 'above', top: 0, height: 40, palette: PALETTE })).toEqual([]);
  });
});
