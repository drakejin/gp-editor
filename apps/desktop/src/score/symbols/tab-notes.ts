import { type Beat, DEFAULT_STYLESHEET, type Grace, type Measure, type NotationStyle, type Note, type SlideType } from '@gp-editor/core';
import type { BeatLayout, MeasureLayout } from '../../lib/layout';
import type { Palette } from '../../theme';
import type { DrawCommand, LineCommand } from '../draw';
import { bendArrows } from './bends';
import {
  type LinkedNote,
  nextNoteOnString,
  previousNoteOnString,
} from './links';
import { bowCurve, halfArc, textWidth, verticalArrow } from './shapes';
import {
  BEND_TIP,
  FRET_BOX,
  beatEndX,
  tabStringY,
  voiceColor,
} from './tab-geometry';

/** Techniques drawn on the tab staff itself: hammer-on / pull-off arcs, slides, bends, grace notes, trill frets, strokes. */

export interface TabNotesContext {
  readonly measure: Measure;
  readonly layout: MeasureLayout;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  /** Y of the first (highest) string. */
  readonly top: number;
  readonly palette: Palette;
  /** The voice being edited: the other voices' techniques are drawn faded. */
  readonly editedVoiceIndex?: number;
  /** The stylesheet's H / P and "sl." labels and voice colours; the defaults when absent. */
  readonly notation?: NotationStyle;
}

function notationOf(context: TabNotesContext): NotationStyle {
  return context.notation ?? DEFAULT_STYLESHEET.notation;
}

const LEGATO = {
  /** Arcs and slide lines start this far inside the fret box edge, where the digits end. */
  inset: 2,
  minHeight: 2,
  maxHeight: 5,
  curvature: 0.08,
  labelSize: 8,
  labelGap: 4,
  width: 1,
} as const;

const SLIDE = {
  /** Half the rise of a slide line across the string. */
  rise: 3,
  /** Short slides out of / into a note. */
  shortLength: 8,
  shortRise: 5,
  width: 1,
} as const;

const SMALL_FRET = {
  size: 8,
  height: 10,
  padding: 1,
  gap: 3,
  charWidth: 0.6,
} as const;
const STROKE = { gap: 3, overhang: 5, width: 1 } as const;

/** A note at its place on the staff. */
interface PlacedNote {
  readonly note: Note;
  readonly beatIndex: number;
  readonly voiceIndex: number;
  readonly position: number;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

function placedNotes(
  context: TabNotesContext,
  beatLayout: BeatLayout,
  position: number,
): PlacedNote[] {
  const beat = context.measure.beats[beatLayout.beatIndex];
  return (beat?.voices ?? []).flatMap((voice, voiceIndex) =>
    voice.notes.map(note => ({
      note,
      beatIndex: beatLayout.beatIndex,
      voiceIndex,
      position,
      x: beatLayout.x,
      y: tabStringY(context.top, note.string),
      color: voiceColor(voiceIndex, context.palette, context.editedVoiceIndex, notationOf(context).showsVoiceColors),
    })),
  );
}

/** x of the linked note: its beat in this measure, or the bar line on the side of the other measure. */
function linkX(
  context: TabNotesContext,
  link: LinkedNote,
  edge: number,
): number | undefined {
  return link.isInOtherMeasure
    ? edge
    : context.layout.beats.find(b => b.beatIndex === link.beatIndex)?.x;
}

function legatoHeight(length: number): number {
  return Math.min(
    LEGATO.maxHeight,
    LEGATO.minHeight + Math.abs(length) * LEGATO.curvature,
  );
}

/** Slur over the fret numbers to the next note on the string, with H (fret rises) or P (fret falls) over it. */
function legatoArc(
  context: TabNotesContext,
  placed: PlacedNote,
  link: LinkedNote,
  isLabelled: boolean,
): DrawCommand[] {
  const toX = linkX(context, link, context.layout.width);
  if (toX === undefined) {
    return [];
  }
  const y = placed.y - FRET_BOX.height / 2 - 1;
  const height = legatoHeight(toX - placed.x);
  const arc = link.isInOtherMeasure
    ? halfArc(placed.x, toX, y, -height, LEGATO.width, placed.color)
    : bowCurve(placed.x, y, toX, y, -height, LEGATO.width, placed.color);
  if (!isLabelled) {
    return [arc];
  }
  const { labels } = notationOf(context);
  const text = link.note.fret >= placed.note.fret ? labels.hammerOn : labels.pullOff;
  const labelY = y - height - LEGATO.labelGap;
  return [arc, linkLabel(text, (placed.x + toX) / 2, labelY, placed.color)];
}

/** A small label over a link between two notes: H, P, sl. */
function linkLabel(text: string, x: number, y: number, color: string): DrawCommand {
  return { kind: 'text', x, y, text, size: LEGATO.labelSize, color, font: 'ui', align: 'center' };
}

/** "sl." over a slide to the next note, when the stylesheet asks for it (Guitar Pro's "Add sl. for slide effects"). */
function slideLabel(context: TabNotesContext, placed: PlacedNote, link: LinkedNote): DrawCommand[] {
  const toX = linkX(context, link, context.layout.width);
  const notation = notationOf(context);
  if (toX === undefined || !notation.showsSlideLabels) {
    return [];
  }
  const y = placed.y - FRET_BOX.height / 2 - LEGATO.maxHeight - LEGATO.labelGap;
  return [linkLabel(notation.labels.slide, (placed.x + toX) / 2, y, placed.color)];
}

function slideLine(
  x1: number,
  x2: number,
  y: number,
  rising: boolean,
  color: string,
): LineCommand {
  const side = rising ? 1 : -1;
  return {
    kind: 'line',
    x1,
    y1: y + side * SLIDE.rise,
    x2,
    y2: y - side * SLIDE.rise,
    width: SLIDE.width,
    color,
  };
}

function shiftSlide(
  context: TabNotesContext,
  placed: PlacedNote,
  link: LinkedNote,
): DrawCommand[] {
  const toX = linkX(context, link, context.layout.width);
  if (toX === undefined) {
    return [];
  }
  const from = placed.x + FRET_BOX.width / 2 - LEGATO.inset;
  const to = link.isInOtherMeasure
    ? toX
    : toX - FRET_BOX.width / 2 + LEGATO.inset;
  const rising = link.note.fret >= placed.note.fret;
  if (!link.isInOtherMeasure) {
    return [slideLine(from, to, placed.y, rising, placed.color)];
  }
  // Half way across the string at the bar line, where the next measure's half goes on.
  const side = rising ? 1 : -1;
  return [
    {
      kind: 'line',
      x1: from,
      y1: placed.y + side * SLIDE.rise,
      x2: to,
      y2: placed.y,
      width: SLIDE.width,
      color: placed.color,
    },
  ];
}

const SHORT_SLIDES: Readonly<
  Partial<Record<SlideType, { readonly isOut: boolean; readonly rise: number }>>
> = {
  outDownwards: { isOut: true, rise: -1 },
  outUpwards: { isOut: true, rise: 1 },
  intoFromBelow: { isOut: false, rise: 1 },
  intoFromAbove: { isOut: false, rise: -1 },
};

function shortSlide(placed: PlacedNote, slide: SlideType): DrawCommand[] {
  const shape = SHORT_SLIDES[slide];
  if (shape === undefined) {
    return [];
  }
  const edge = FRET_BOX.width / 2 - LEGATO.inset;
  const x1 = shape.isOut
    ? placed.x + edge
    : placed.x - edge - SLIDE.shortLength;
  const lift = shape.rise * SLIDE.shortRise;
  // Out of a note: start on the string and leave; into a note: arrive on the string.
  const [y1, y2] = shape.isOut
    ? [placed.y, placed.y - lift]
    : [placed.y + lift, placed.y];
  return [
    {
      kind: 'line',
      x1,
      y1,
      x2: x1 + SLIDE.shortLength,
      y2,
      width: SLIDE.width,
      color: placed.color,
    },
  ];
}

function noteLinks(
  context: TabNotesContext,
  placed: PlacedNote,
): DrawCommand[] {
  const { note } = placed;
  const linked =
    note.effect.hammer ||
    note.effect.slides.some(slide => slide === 'shift' || slide === 'legato');
  const link = linked
    ? nextNoteOnString(
        context.measure,
        placed.beatIndex,
        placed.voiceIndex,
        note.string,
        context.nextMeasure,
      )
    : undefined;
  const isLegatoSlide = note.effect.slides.includes('legato');
  return [
    ...(link !== undefined && (note.effect.hammer || isLegatoSlide)
      ? legatoArc(context, placed, link, note.effect.hammer && notationOf(context).showsHopoLabels)
      : []),
    ...(link !== undefined &&
    note.effect.slides.some(s => s === 'shift' || s === 'legato')
      ? [...shiftSlide(context, placed, link), ...slideLabel(context, placed, link)]
      : []),
    ...note.effect.slides.flatMap(slide => shortSlide(placed, slide)),
  ];
}

function smallFret(
  text: string,
  x: number,
  y: number,
  context: TabNotesContext,
  color: string,
): DrawCommand[] {
  const width =
    text.length * SMALL_FRET.size * SMALL_FRET.charWidth +
    2 * SMALL_FRET.padding;
  return [
    {
      kind: 'rect',
      x: x - width / 2,
      y: y - SMALL_FRET.height / 2,
      width,
      height: SMALL_FRET.height,
      color: context.palette.paper,
      radius: 2,
    },
    {
      kind: 'text',
      x,
      y,
      text,
      size: SMALL_FRET.size,
      color,
      font: 'mono',
      align: 'center',
    },
  ];
}

function graceFret(
  context: TabNotesContext,
  placed: PlacedNote,
  grace: Grace,
): DrawCommand[] {
  const text = grace.isDead ? 'x' : String(grace.fret);
  const x =
    placed.x -
    FRET_BOX.width / 2 -
    SMALL_FRET.gap -
    (text.length * SMALL_FRET.size * SMALL_FRET.charWidth) / 2;
  return smallFret(text, x, placed.y, context, placed.color);
}

function trillFret(
  context: TabNotesContext,
  placed: PlacedNote,
  fret: number,
): DrawCommand[] {
  const text = `(${fret})`;
  const x =
    placed.x + FRET_BOX.width / 2 + textWidth(text, SMALL_FRET.size) / 2;
  return smallFret(text, x, placed.y, context, placed.color);
}

function bend(context: TabNotesContext, placed: PlacedNote): DrawCommand[] {
  const points = placed.note.effect.bend?.points ?? [];
  const startX = placed.x + FRET_BOX.width / 2 - LEGATO.inset;
  const endX = beatEndX(context.layout, placed.position) - LEGATO.inset;
  return bendArrows(points, {
    startX,
    endX,
    baseY: placed.y,
    tipY: context.top - BEND_TIP,
    color: placed.color,
  });
}

function noteTechniques(
  context: TabNotesContext,
  placed: PlacedNote,
): DrawCommand[] {
  const { effect } = placed.note;
  return [
    ...noteLinks(context, placed),
    ...bend(context, placed),
    ...(effect.grace === undefined
      ? []
      : graceFret(context, placed, effect.grace)),
    ...(effect.trill === undefined
      ? []
      : trillFret(context, placed, effect.trill.fret)),
  ];
}

/** A strummed chord: an arrow left of the fret numbers over the strings it spans, pointing the way of the stroke. */
function strokeArrow(
  beat: Beat | undefined,
  x: number,
  context: TabNotesContext,
): DrawCommand[] {
  const strings =
    beat?.voices.flatMap(voice => voice.notes.map(note => note.string)) ?? [];
  if (
    beat === undefined ||
    beat.stroke.direction === 'none' ||
    strings.length === 0
  ) {
    return [];
  }
  const high = tabStringY(context.top, Math.min(...strings)) - STROKE.overhang;
  const low = tabStringY(context.top, Math.max(...strings)) + STROKE.overhang;
  const arrowX = x - FRET_BOX.width / 2 - STROKE.gap;
  const [from, to] = beat.stroke.direction === 'up' ? [low, high] : [high, low];
  return verticalArrow(arrowX, from, to, STROKE.width, context.palette.text);
}

/** Slurs and slides that come in from the previous measure, drawn from the bar line to the first note they reach. */
function incomingLinks(
  context: TabNotesContext,
  notes: readonly PlacedNote[],
): DrawCommand[] {
  return notes.flatMap(placed => {
    const from = previousNoteOnString(
      context.measure,
      placed.beatIndex,
      placed.voiceIndex,
      placed.note.string,
      context.previousMeasure,
    );
    if (from === undefined || !from.isInOtherMeasure) {
      return [];
    }
    const y = placed.y - FRET_BOX.height / 2 - 1;
    const arc =
      from.note.effect.hammer || from.note.effect.slides.includes('legato')
        ? [
            halfArc(
              placed.x,
              0,
              y,
              -legatoHeight(placed.x),
              LEGATO.width,
              placed.color,
            ),
          ]
        : [];
    const slid = from.note.effect.slides.some(
      slide => slide === 'shift' || slide === 'legato',
    );
    const side = placed.note.fret >= from.note.fret ? 1 : -1;
    const toX = placed.x - FRET_BOX.width / 2 + LEGATO.inset;
    const line: DrawCommand[] = slid
      ? [
          {
            kind: 'line',
            x1: 0,
            y1: placed.y,
            x2: toX,
            y2: placed.y - side * SLIDE.rise,
            width: SLIDE.width,
            color: placed.color,
          },
        ]
      : [];
    return [...arc, ...line];
  });
}

/** The first note on each string in each voice: where links from the previous measure arrive. */
function firstOnEachString(notes: readonly PlacedNote[]): PlacedNote[] {
  return notes.filter(
    (placed, i) =>
      notes.findIndex(
        other =>
          other.voiceIndex === placed.voiceIndex &&
          other.note.string === placed.note.string,
      ) === i,
  );
}

export function engraveTabTechniques(context: TabNotesContext): DrawCommand[] {
  const notes = context.layout.beats.flatMap((beatLayout, position) =>
    placedNotes(context, beatLayout, position),
  );
  return [
    ...incomingLinks(
      context,
      context.previousMeasure === undefined ? [] : firstOnEachString(notes),
    ),
    ...notes.flatMap(placed => noteTechniques(context, placed)),
    ...context.layout.beats.flatMap(beatLayout =>
      strokeArrow(
        context.measure.beats[beatLayout.beatIndex],
        beatLayout.x,
        context,
      ),
    ),
  ];
}
