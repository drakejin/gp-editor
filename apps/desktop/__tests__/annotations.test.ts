import { type Annotation, type Song, setBeatAnnotation } from '@gp-editor/core';
import { buildPdfDocument, pdfPageCount } from '../src/export/pdf-document';
import type { MeasureLayout } from '../src/lib/layout';
import {
  ANNOTATION_BOX,
  MAX_BOX_LINES,
  annotationBands,
  annotationColors,
  annotationRowBands,
  annotationTextWidth,
  engraveAnnotationBand,
  measureAnnotation,
  wrapAnnotation,
} from '../src/score/annotations';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import type { DrawCommand, RectCommand, TextCommand } from '../src/score/draw';
import { ROW, type ScoreMode, rowGeometry, stavesSpan } from '../src/score/geometry';
import { engraveRow } from '../src/score/row';
import { type ScoreLayout, layoutScore } from '../src/score/score-layout';
import { engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { PALETTE, allFinite, textValues, texts } from '../test-support/score-helpers';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const at = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0 });

/** Three bars of four quarters. */
function quarters(): Song {
  const bar = (first: number) => [0, 1, 2, 3].map((i) => beat(first + i * 960, [note(1, i)]));
  return makeSong([bar(960), bar(4800), bar(8640)]);
}

function annotate(song: Song, measureIndex: number, beatIndex: number, annotation: Annotation): Song {
  return setBeatAnnotation(song, at(measureIndex, beatIndex), annotation);
}

const measureLayout = (measureIndex: number, width = 200): MeasureLayout => ({
  measureIndex,
  width,
  beats: [0, 1, 2, 3].map((beatIndex) => ({ beatIndex, x: 20 + beatIndex * 45 })),
  showTimeSignature: false,
  showTempo: false,
  showTripletFeel: false,
});

const rects = (commands: readonly DrawCommand[]): RectCommand[] => commands.filter((command): command is RectCommand => command.kind === 'rect');
/** A palette whose annotation ink nothing else uses, so the boxes' outlines are found by colour. */
const INKED = { ...PALETTE, annotationFill: '#FFF0B0', annotationInk: '#5C4300' };
const outlines = (commands: readonly DrawCommand[]) => rects(commands).filter((rect) => rect.color === INKED.annotationInk);

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

describe('a long annotation', () => {
  it(`draws at most ${MAX_BOX_LINES} lines, the last cut with an ellipsis`, () => {
    // Act
    const box = measureAnnotation({ text: 'word '.repeat(200), placement: 'above' });

    // Assert
    expect(box.lines).toHaveLength(MAX_BOX_LINES);
    expect(box.lines.at(-1)?.endsWith('…')).toBe(true);
    expect(box.height).toBe(MAX_BOX_LINES * ANNOTATION_BOX.lineHeight + 2 * ANNOTATION_BOX.padding);
  });
});

describe('annotationRowBands', () => {
  it('puts boxes that do not fit side by side in a second lane, and makes room for both lanes', () => {
    // Arrange: four long annotations on the four beats of one 200-point bar.
    const text = 'a long annotation on this beat';
    const song = [0, 1, 2, 3].reduce((current, beatIndex) => annotate(current, 0, beatIndex, { text, placement: 'above' }), quarters());
    const row = { measures: [measureLayout(0)] };
    const box = measureAnnotation({ text, placement: 'above' });
    const { gap } = ANNOTATION_BOX;

    // Act
    const bands = annotationRowBands(song.tracks[0], row);
    const commands = engraveAnnotationBand({ track: song.tracks[0]!, placed: [{ layout: measureLayout(0), x: 40 }], placement: 'above', edge: 400, palette: INKED });

    // Assert
    const boxes = outlines(commands);
    const lanes = new Set(boxes.map((rect) => rect.y));
    expect(lanes.size).toBeGreaterThan(1);
    expect(bands.annotationsAbove).toBe(lanes.size * (box.height + gap) + gap);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
      const isApart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(isApart).toBe(true);
    }));
    expect(Math.min(...boxes.map((rect) => rect.y))).toBe(400 - bands.annotationsAbove + gap);
  });

  it('is one lane, as tall as its tallest box, when the boxes fit side by side', () => {
    const song = annotate(annotate(quarters(), 0, 0, { text: 'a', placement: 'below' }), 0, 3, { text: 'b\nc', placement: 'below' });
    const bands = annotationRowBands(song.tracks[0], { measures: [measureLayout(0)] });
    expect(bands).toEqual({ annotationsAbove: 0, annotationsBelow: measureAnnotation({ text: 'b\nc', placement: 'below' }).height + 2 * ANNOTATION_BOX.gap });
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
  const placed = [{ layout: measureLayout(0), x: 40 }, { layout: measureLayout(1), x: 240 }];
  const band = (placement: 'above' | 'below', edge = 70) =>
    engraveAnnotationBand({ track, placed, placement, edge, palette: { ...PALETTE, annotationFill: '#FFF0B0', annotationInk: '#5C4300' } });

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
    const [aboveBox] = rects(band('above', 70));
    const [belowBox] = rects(band('below', 300));

    // Assert
    expect((aboveBox?.y ?? 0) + (aboveBox?.height ?? 0)).toBe(70 - ANNOTATION_BOX.gap);
    expect(belowBox?.y).toBe(300 + ANNOTATION_BOX.gap);
    expect(texts(band('below')).map((text) => text.text)).toEqual(['two', 'lines']);
  });

  it('keeps boxes apart (in another lane when they do not fit side by side), and inside the row', () => {
    // Arrange: long annotations on two neighbouring beats of the last bar.
    const crowded = annotate(annotate(quarters(), 1, 2, { text: 'a long annotation here', placement: 'above' }), 1, 3, { text: 'and another long one', placement: 'above' });
    const commands = engraveAnnotationBand({ track: crowded.tracks[0]!, placed, placement: 'above', edge: 40, palette: PALETTE });

    // Act
    const [first, , second] = rects(commands);

    // Assert
    const [a, b] = [first!, second!];
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    [a, b].forEach((box) => {
      expect(box.x).toBeGreaterThanOrEqual(40);
      expect(box.x + box.width).toBeLessThanOrEqual(240 + 200);
    });
  });

  it('draws nothing for a placement without annotations', () => {
    const plain = quarters().tracks[0]!;
    expect(engraveAnnotationBand({ track: plain, placed, placement: 'above', edge: 40, palette: PALETTE })).toEqual([]);
  });
});

describe('rowGeometry with annotation bands', () => {
  it.each<ScoreMode>(['notationAndTab', 'notation', 'tab'])('is the row it always was without them (%s)', (mode) => {
    const geometry = rowGeometry(mode, 6, { hasDirections: true, hasLyrics: true, hasDynamics: true });
    expect(rowGeometry(mode, 6, { hasDirections: true, hasLyrics: true, hasDynamics: true, annotationsAbove: 0, annotationsBelow: 0 })).toEqual(geometry);
    expect(geometry.annotationsAboveBottom).toBeUndefined();
    expect(geometry.annotationsBelowTop).toBeUndefined();
  });

  it.each<ScoreMode>(['notationAndTab', 'notation', 'tab'])('puts the band over the staves under the heading, and the one under them before the gap (%s)', (mode) => {
    // Arrange
    const plain = rowGeometry(mode, 6, { hasDirections: true, hasLyrics: true, hasPedals: true });

    // Act
    const annotated = rowGeometry(mode, 6, { hasDirections: true, hasLyrics: true, hasPedals: true, annotationsAbove: 40, annotationsBelow: 30 });

    // Assert
    expect(annotated.annotationsAboveBottom).toBe(ROW.heading + 40);
    expect(annotated.directionsY).toBe((plain.directionsY ?? 0) + 40);
    expect(annotated.notationTop).toBe(plain.notationTop === undefined ? undefined : plain.notationTop + 40);
    expect(annotated.tabTop).toBe(plain.tabTop === undefined ? undefined : plain.tabTop + 40);
    expect(annotated.annotationsBelowTop).toBe(plain.height - ROW.gap + 40);
    expect(annotated.height).toBe(plain.height + 70);
  });
});

/** Twelve bars of quarters; the song's annotations by bar (0-based) and placement. */
function longSong(annotations: readonly (readonly [number, Annotation])[] = []): Song {
  const bar = (first: number) => [0, 1, 2, 3].map((i) => beat(first + i * 960, [note(1, i)]));
  const plain = makeSong(Array.from({ length: 12 }, (_, i) => bar(960 + i * 3840)));
  return annotations.reduce((song, [measureIndex, annotation]) => annotate(song, measureIndex, 1, annotation), plain);
}

const systemOf = (layout: ScoreLayout, measureIndex: number) => layout.systems.findIndex((system) => system.rows[0]?.measures.some((m) => m.measureIndex === measureIndex));

describe('annotation bands in the layout', () => {
  const WIDTH = 700;
  const above: Annotation = { text: 'Watch the bend\nsofter the second time', placement: 'above' };
  const below: Annotation = { text: 'breathe', placement: 'below' };

  it('makes room only in the systems whose bars have annotations; the others keep their height', () => {
    // Arrange
    const plain = layoutScore(longSong(), [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH);

    // Act
    const layout = layoutScore(longSong([[9, above], [1, below]]), [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH);

    // Assert
    const [withAbove, withBelow] = [systemOf(layout, 9), systemOf(layout, 1)];
    const bands = annotationBands(longSong([[9, above], [1, below]]).tracks[0], [9, 1]);
    expect(layout.systems.length).toBe(plain.systems.length);
    expect(withAbove).not.toBe(withBelow);
    layout.systems.forEach((system, index) => {
      const extra = index === withAbove ? bands.above : index === withBelow ? bands.below : 0;
      expect(system.height).toBe((plain.systems[index]?.height ?? 0) + extra);
    });
    expect(layout.systems[withAbove]?.top).toBe(plain.systems[withAbove]?.top === undefined ? undefined : (plain.systems[withAbove]?.top ?? 0) + (withBelow < withAbove ? bands.below : 0));
    // The track's staves (the tallest a system can be, the PDF's bound) have both.
    expect(layout.staves[0]?.geometry.height).toBe((plain.staves[0]?.geometry.height ?? 0) + bands.above + bands.below);
  });

  it('draws the boxes in their band, clear of the heading and the staves', () => {
    // Arrange
    const song = longSong([[9, above], [1, below]]);
    const layout = layoutScore(song, [{ trackIndex: 0, mode: 'notationAndTab' }], DEFAULT_CHORD_DISPLAY, WIDTH);
    const engraved = (systemIndex: number) => {
      const system = layout.systems[systemIndex]!;
      const staff = system.staves[0]!;
      return { staff, commands: engraveRow({ song, trackIndex: 0, row: system.rows[0]!, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: INKED, markLanes: staff.markLanes, hasHeading: true }) };
    };

    // Act
    const top = engraved(systemOf(layout, 9));
    const bottom = engraved(systemOf(layout, 1));
    const neither = engraved(layout.systems.findIndex((_, i) => i !== systemOf(layout, 9) && i !== systemOf(layout, 1)));

    // Assert
    const span = (staff: typeof top.staff) => stavesSpan(staff.geometry, 6)!;
    const [aboveBox] = outlines(top.commands);
    const aboveBand = annotationBands(song.tracks[0], layout.systems[systemOf(layout, 9)]!.rows[0]!.measures.map((m) => m.measureIndex)).above;
    const bandTop = (top.staff.geometry.annotationsAboveBottom ?? 0) - aboveBand;
    const barNumber = texts(top.commands).find((text) => text.text === '10');
    expect(textValues(top.commands)).toEqual(expect.arrayContaining(['Watch the bend', 'softer the second time']));
    // Under the heading (the bar number's ink above the band), over everything under it.
    expect(barNumber!.y + barNumber!.size / 2).toBeLessThanOrEqual(bandTop);
    expect(aboveBox!.y).toBeGreaterThanOrEqual(bandTop);
    expect(aboveBox!.y + aboveBox!.height).toBeLessThan(span(top.staff).top);
    const [belowBox] = outlines(bottom.commands);
    expect(belowBox!.y).toBeGreaterThan(span(bottom.staff).bottom);
    expect(belowBox!.y + belowBox!.height).toBeLessThanOrEqual(bottom.staff.geometry.height - ROW.gap);
    expect(textValues(neither.commands)).not.toContain('breathe');
    expect(outlines(neither.commands)).toEqual([]);
  });

  it('gives a lower staff of a multitrack system its own band, under the staff above it', () => {
    // Arrange: the second track's bar 2 has the annotation.
    const base = longSong();
    const second = base.tracks[0]!.measures.map((measure) => measure.beats);
    const song = annotate2(withTrack(base, second), { text: 'bass enters', placement: 'above' });
    const specs = [{ trackIndex: 0, mode: 'tab' as const }, { trackIndex: 1, mode: 'tab' as const }];
    const plain = layoutScore(withTrack(base, second), specs, DEFAULT_CHORD_DISPLAY, WIDTH);

    // Act
    const layout = layoutScore(song, specs, DEFAULT_CHORD_DISPLAY, WIDTH);

    // Assert
    const systemIndex = systemOf(layout, 1);
    const system = layout.systems[systemIndex]!;
    const lower = system.staves[1]!;
    expect(system.staves[0]?.height).toBe(plain.systems[systemIndex]?.staves[0]?.height);
    expect(lower.geometry.annotationsAboveBottom).toBeDefined();
    const decor = staffDecor(song, layout, systemIndex, 1)!;
    const commands = engraveSystemStaff({ song, trackIndex: 1, row: system.rows[1]!, headerWidth: layout.clefWidth, mode: 'tab', geometry: lower.geometry, palette: PALETTE, markLanes: lower.markLanes, hasHeading: false }, decor);
    expect(textValues(commands)).toContain('bass enters');
    // Drawn after the bar lines that run through the system, so none crosses the box.
    const lastLine = commands.map((command) => command.kind).lastIndexOf('line');
    expect(commands.findIndex((command) => command.kind === 'text' && command.text === 'bass enters')).toBeGreaterThan(lastLine);
  });
});

/** The second track's bar 2, beat 1 annotated. */
function annotate2(song: Song, annotation: Annotation): Song {
  return setBeatAnnotation(song, { trackIndex: 1, measureIndex: 1, beatIndex: 0, voiceIndex: 0 }, annotation);
}

describe('annotations in the PDF', () => {
  const song = longSong([[2, { text: 'Watch the bend', placement: 'above' }], [7, { text: 'breathe', placement: 'below' }]]);
  const allText = (document: ReturnType<typeof buildPdfDocument>) => document.pages.flatMap((page) => textValues(page.commands));

  it('prints them as the screen draws them', () => {
    const document = buildPdfDocument(song, 0, 'notationAndTab', { fileName: 'a.gp' });
    expect(allText(document)).toEqual(expect.arrayContaining(['Watch the bend', 'breathe']));
  });

  it('leaves them and their room out when the export asks', () => {
    // Act
    const document = buildPdfDocument(song, 0, 'notationAndTab', { fileName: 'a.gp', hidesAnnotations: true });

    // Assert
    expect(allText(document)).not.toContain('Watch the bend');
    expect(allText(document)).not.toContain('breathe');
    expect(document).toEqual(buildPdfDocument(longSong(), 0, 'notationAndTab', { fileName: 'a.gp' }));
    expect(pdfPageCount(song, 0, 'notationAndTab', { fileName: 'a.gp', hidesAnnotations: true })).toBe(pdfPageCount(longSong(), 0, 'notationAndTab', { fileName: 'a.gp' }));
  });
});
