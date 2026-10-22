import type { Measure } from '@gp-editor/core';
import type { Chord, NoteHead } from './chords';
import type { VoiceEvent } from './events';
import { NOTATION, ORNAMENT, OTTAVA, STAFF, positionY } from './metrics';

/** The measure's voices once noteheads, stems and beams are placed: what technique marks are positioned against. */
export interface VoiceLayout {
  readonly events: readonly VoiceEvent[];
  readonly chords: readonly (Chord | undefined)[];
  /** Stem ends after beaming, per event. */
  readonly tips: readonly (number | undefined)[];
  readonly isMultiVoice: boolean;
  /** y of the staff's top line. */
  readonly top: number;
  /** The bar line at the right edge: marks that go on into the next measure end here. */
  readonly width: number;
  /** Where marks coming in from the previous measure start: 0, or after a key / time signature at the measure start. */
  readonly entryX: number;
  readonly measure: Measure;
  readonly previousMeasure?: Measure;
  readonly nextMeasure?: Measure;
  readonly color: string;
}

/** Where the time of event `index` ends: just before the next event of its voice, or before the bar line. */
export function eventEndX(layout: VoiceLayout, index: number): number {
  const event = layout.events[index];
  const next = layout.events.find(
    (other, i) => i > index && other.voiceIndex === event?.voiceIndex,
  );
  const nextLeft =
    next === undefined
      ? undefined
      : layout.chords[layout.events.indexOf(next)]?.left ??
        next.x - NOTATION.space / 2;
  return (nextLeft ?? layout.width) - ORNAMENT.endGap;
}

/** The chord of the event at `beatIndex` in voice `voiceIndex`, and its notehead on `string`. */
export function headOnString(
  layout: VoiceLayout,
  beatIndex: number,
  voiceIndex: number,
  string: number,
): { readonly chord: Chord; readonly head: NoteHead } | undefined {
  const index = layout.events.findIndex(
    event => event.beatIndex === beatIndex && event.voiceIndex === voiceIndex,
  );
  const chord = layout.chords[index];
  const head = chord?.heads.find(h => h.note.string === string);
  return chord === undefined || head === undefined
    ? undefined
    : { chord, head };
}

/** Highest point of a chord: its top notehead or the end of an up stem. */
export function chordTop(chord: Chord, tip: number | undefined): number {
  const heads =
    Math.min(...chord.heads.map(head => head.y)) - NOTATION.space / 2;
  return chord.direction === 'up' && tip !== undefined
    ? Math.min(heads, tip)
    : heads;
}

/** Lowest point of a chord: its bottom notehead or the end of a down stem. */
export function chordBottom(chord: Chord, tip: number | undefined): number {
  const heads =
    Math.max(...chord.heads.map(head => head.y)) + NOTATION.space / 2;
  return chord.direction === 'down' && tip !== undefined
    ? Math.max(heads, tip)
    : heads;
}

/** A line above the staff, the given chords and any 8va mark over them, for trills and vibrato; kept inside the notation band. */
export function lineAbove(
  layout: VoiceLayout,
  indexes: readonly number[],
  glyphHeight: number,
): number {
  const tops = indexes.flatMap(index => {
    const chord = layout.chords[index];
    return chord === undefined ? [] : [chordTop(chord, layout.tips[index])];
  });
  const isUnderOttava = indexes.some(
    index => (layout.events[index]?.ottava ?? 0) > 0,
  );
  const ottavaRoom = isUnderOttava ? OTTAVA.gap + OTTAVA.fontSize / 2 : 0;
  const y =
    Math.min(positionY(layout.top, STAFF.topLine), ...tops) -
    ORNAMENT.gap -
    ottavaRoom;
  return Math.max(layout.top - NOTATION.above + glyphHeight, y);
}
