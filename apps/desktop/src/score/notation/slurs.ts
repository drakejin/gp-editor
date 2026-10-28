import type { SlideType } from '@gp-editor/core';
import type { DrawCommand, LineCommand } from '../draw';
import {
  type LinkedNote,
  nextNoteOnString,
  previousNoteOnString,
} from '../symbols/links';
import { type Gap, bowCurve, curveAround, halfArc, lineAround } from '../symbols/shapes';
import { type Chord, type NoteHead, chordInkLeft } from './chords';
import type { VoiceEvent } from './events';
import { SLIDE, SLUR } from './metrics';
import { type ChordHead, type VoiceLayout, headOnString } from './voice-layout';
import { isUpperVoice } from '../voices';

/** Slurs of hammer-ons, pull-offs and legato slides, and slide lines, between noteheads on the notation staff. */

type Side = 1 | -1;

interface PlacedHead {
  readonly event: VoiceEvent;
  readonly chord: Chord;
  readonly head: NoteHead;
}

/** Slurs go opposite the stem; with more than one voice, away from the other voices (above voices 1 and 3). */
function slurSide(chord: Chord, isMultiVoice: boolean): Side {
  if (isMultiVoice) {
    return isUpperVoice(chord.event.voiceIndex) ? -1 : 1;
  }
  return chord.direction === 'up' ? 1 : -1;
}

function centre(head: NoteHead): number {
  return head.x + head.width / 2;
}

function isSlurred(link: LinkedNote | undefined): boolean {
  return (
    link !== undefined &&
    (link.note.effect.hammer || link.note.effect.slides.includes('legato'))
  );
}

function isSlid(slides: readonly SlideType[]): boolean {
  return slides.some(slide => slide === 'shift' || slide === 'legato');
}

/**
 * The notehead a link ends on: in this measure, or in the next measure when that is on the row too; undefined at a row's
 * end, where the link runs to the bar line.
 */
function linkedHead(
  layout: VoiceLayout,
  from: PlacedHead,
  link: LinkedNote,
): ChordHead | undefined {
  const { voiceIndex } = from.event;
  const { string } = from.head.note;
  return link.isInOtherMeasure
    ? layout.nextBar?.headOn(link.beatIndex, voiceIndex, string)
    : headOnString(layout, link.beatIndex, voiceIndex, string);
}

/** A link into the next measure at a row's end: it runs to the bar line, and the next row's start draws it coming in. */
function runsToBarLine(layout: VoiceLayout, link: LinkedNote): boolean {
  return link.isInOtherMeasure && layout.nextBar === undefined;
}

/** What a link into the next measure leaves out: the signs at its start (key or time signature, clef change, repeat). */
function gapOf(layout: VoiceLayout, link: LinkedNote): Gap {
  const entryX = link.isInOtherMeasure ? layout.nextBar?.entryX : undefined;
  return { from: layout.width, to: entryX ?? layout.width };
}

function slur(
  layout: VoiceLayout,
  from: PlacedHead,
  link: LinkedNote,
): DrawCommand[] {
  const side = slurSide(from.chord, layout.isMultiVoice);
  const y1 = from.head.y + side * SLUR.offset;
  const to = linkedHead(layout, from, link);
  if (to === undefined && runsToBarLine(layout, link)) {
    return [
      halfArc(
        centre(from.head),
        layout.width,
        y1,
        side * SLUR.crossHeight,
        SLUR.width,
        layout.color,
      ),
    ];
  }
  if (to === undefined) {
    return [];
  }
  const x1 = centre(from.head);
  const x2 = centre(to.head);
  const height = Math.min(
    SLUR.maxHeight,
    SLUR.minHeight + (x2 - x1) * SLUR.curvature,
  );
  const arc = bowCurve(
    x1,
    y1,
    x2,
    to.head.y + side * SLUR.offset,
    side * height,
    SLUR.width,
    layout.color,
  );
  return curveAround(arc, gapOf(layout, link));
}

function slideTo(
  layout: VoiceLayout,
  from: PlacedHead,
  link: LinkedNote,
): DrawCommand[] {
  const x1 = from.head.x + from.head.width + SLIDE.gap;
  const y1 = from.head.y;
  const isRising = link.note.fret >= from.head.note.fret;
  const to = linkedHead(layout, from, link);
  if (to === undefined && runsToBarLine(layout, link)) {
    return [
      line(
        x1,
        y1,
        layout.width,
        isRising ? y1 - SLIDE.shortRise : y1 + SLIDE.shortRise,
        layout.color,
      ),
    ];
  }
  if (to === undefined) {
    return [];
  }
  const rise =
    to.head.y === y1 ? (isRising ? SLIDE.minRise : -SLIDE.minRise) : 0;
  const slide = line(
    x1,
    y1 + rise,
    chordInkLeft(to.chord) - SLIDE.gap,
    to.head.y - rise,
    layout.color,
  );
  return lineAround(slide, gapOf(layout, link));
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): LineCommand {
  return { kind: 'line', x1, y1, x2, y2, width: SLIDE.width, color };
}

/** Short slides out of a note (from its right) or into it (from its left). */
function shortSlide(from: PlacedHead, slide: SlideType, color: string): LineCommand[] {
  const { head, chord } = from;
  const right = head.x + head.width + SLIDE.gap;
  const left = chordInkLeft(chord) - SLIDE.gap;
  switch (slide) {
    case 'outDownwards':
      return [line(right, head.y, right + SLIDE.shortLength, head.y + SLIDE.shortRise, color)];
    case 'outUpwards':
      return [line(right, head.y, right + SLIDE.shortLength, head.y - SLIDE.shortRise, color)];
    case 'intoFromBelow':
      return [line(left - SLIDE.shortLength, head.y + SLIDE.shortRise, left, head.y, color)];
    case 'intoFromAbove':
      return [line(left - SLIDE.shortLength, head.y - SLIDE.shortRise, left, head.y, color)];
    default:
      return [];
  }
}

function outgoing(layout: VoiceLayout, from: PlacedHead): DrawCommand[] {
  const { effect, string } = from.head.note;
  const slides = effect.slides;
  const isLinked = effect.hammer || isSlid(slides);
  const link = isLinked
    ? nextNoteOnString(
        layout.measure,
        from.event.beatIndex,
        from.event.voiceIndex,
        string,
        layout.nextMeasure,
      )
    : undefined;
  return [
    ...(link !== undefined && (effect.hammer || slides.includes('legato'))
      ? slur(layout, from, link)
      : []),
    ...(link !== undefined && isSlid(slides)
      ? slideTo(layout, from, link)
      : []),
    ...slides.flatMap(slide => shortSlide(from, slide, layout.color)),
  ];
}

/** Slurs and slides from the previous measure, drawn in from where the measure's notes start. */
function incoming(layout: VoiceLayout, to: PlacedHead): DrawCommand[] {
  const { string, fret } = to.head.note;
  const link = previousNoteOnString(
    layout.measure,
    to.event.beatIndex,
    to.event.voiceIndex,
    string,
    layout.previousMeasure,
  );
  if (link === undefined || !link.isInOtherMeasure) {
    return [];
  }
  const side = slurSide(to.chord, layout.isMultiVoice);
  const slurred = isSlurred(link)
    ? [
        halfArc(
          centre(to.head),
          layout.entryX,
          to.head.y + side * SLUR.offset,
          side * SLUR.crossHeight,
          SLUR.width,
          layout.color,
        ),
      ]
    : [];
  if (!isSlid(link.note.effect.slides)) {
    return slurred;
  }
  const fromY =
    fret >= link.note.fret
      ? to.head.y + SLIDE.shortRise
      : to.head.y - SLIDE.shortRise;
  return [
    ...slurred,
    line(
      layout.entryX,
      fromY,
      chordInkLeft(to.chord) - SLIDE.gap,
      to.head.y,
      layout.color,
    ),
  ];
}

function placedHeads(layout: VoiceLayout): PlacedHead[] {
  return layout.chords.flatMap((chord, index) => {
    const event = layout.events[index];
    return chord === undefined || event === undefined
      ? []
      : chord.heads.map(head => ({ event, chord, head }));
  });
}

/** The first notehead on each string in each voice: where slurs and slides from the previous measure arrive. */
function firstOnEachString(heads: readonly PlacedHead[]): PlacedHead[] {
  return heads.filter(
    (placed, i) =>
      heads.findIndex(
        other =>
          other.event.voiceIndex === placed.event.voiceIndex &&
          other.head.note.string === placed.head.note.string,
      ) === i,
  );
}

export function legatoMarks(layout: VoiceLayout): DrawCommand[] {
  const heads = placedHeads(layout);
  return [
    ...(layout.previousMeasure === undefined || layout.isRowStart === false
      ? []
      : firstOnEachString(heads).flatMap(placed => incoming(layout, placed))),
    ...heads.flatMap(placed => outgoing(layout, placed)),
  ];
}
