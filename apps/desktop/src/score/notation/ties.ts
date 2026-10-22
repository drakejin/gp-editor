import type { Measure } from '@gp-editor/core';
import type { CurveCommand } from '../draw';
import { nextNoteOnString } from '../symbols/links';
import { halfArc } from '../symbols/shapes';
import type { Chord, NoteHead } from './chords';
import { arc } from './glyphs';
import { TIE } from './metrics';
import type { VoiceLayout } from './voice-layout';

/** Ties grow flatter than this ratio of their length. */
const TIE_CURVATURE = 0.1;
/** Shorter ties than this are not drawn. */
const MIN_TIE_LENGTH = 2;

type Side = 1 | -1;

/** Where a tie into a note starts: after the previous note on its string in this measure, or across the bar line. */
type TieStart = { readonly x: number } | 'fromPreviousMeasure' | undefined;

function hasNoteOnString(
  measure: Measure | undefined,
  voiceIndex: number,
  string: number,
): boolean {
  return (
    measure?.beats.some(
      beat =>
        beat.voices[voiceIndex]?.notes.some(note => note.string === string) ??
        false,
    ) ?? false
  );
}

function tieStart(
  layout: VoiceLayout,
  index: number,
  head: NoteHead,
): TieStart {
  const event = layout.events[index];
  if (event === undefined) {
    return undefined;
  }
  for (let i = index - 1; i >= 0; i--) {
    const from =
      layout.events[i]?.voiceIndex === event.voiceIndex
        ? layout.chords[i]?.heads.find(h => h.note.string === head.note.string)
        : undefined;
    if (from !== undefined) {
      return { x: from.x + from.width + TIE.gap };
    }
  }
  return hasNoteOnString(
    layout.previousMeasure,
    event.voiceIndex,
    head.note.string,
  )
    ? 'fromPreviousMeasure'
    : undefined;
}

/** Ties curve away from the stem; in a chord the upper half curves up and the lower half down; with two voices, away from the other voice. */
function tieSide(chord: Chord, head: NoteHead, isMultiVoice: boolean): Side {
  const awayFromStem: Side = chord.direction === 'up' ? 1 : -1;
  if (isMultiVoice) {
    return awayFromStem === 1 ? -1 : 1;
  }
  if (chord.heads.length === 1) {
    return awayFromStem;
  }
  return chord.heads.indexOf(head) < chord.heads.length / 2 ? 1 : -1;
}

/** The tie into a note: a full arc from the previous note in the measure, or the second half of one across the bar line. */
function incomingTie(
  layout: VoiceLayout,
  chord: Chord,
  index: number,
  head: NoteHead,
): CurveCommand[] {
  const start = tieStart(layout, index, head);
  const end = head.x - TIE.gap;
  const side = tieSide(chord, head, layout.isMultiVoice);
  const y = head.y + side * TIE.offset;
  if (start === 'fromPreviousMeasure') {
    // From the bar line, where the previous measure's half ends, unless a key or time signature is in the way.
    const crest =
      layout.entryX > 0 ? Math.max(layout.entryX, end - TIE.entry) : 0;
    return end - crest < MIN_TIE_LENGTH
      ? []
      : [
          halfArc(
            end,
            crest,
            y,
            side * TIE.crossHeight,
            TIE.width,
            layout.color,
          ),
        ];
  }
  if (start === undefined || end - start.x < MIN_TIE_LENGTH) {
    return [];
  }
  const height = Math.min(
    TIE.maxHeight,
    TIE.minHeight + (end - start.x) * TIE_CURVATURE,
  );
  return [arc(start.x, end, y, side * height, TIE.width, layout.color)];
}

/** The first half of a tie to the next measure: from the last note on the string to the bar line. */
function outgoingTie(
  layout: VoiceLayout,
  chord: Chord,
  head: NoteHead,
): CurveCommand[] {
  const next = nextNoteOnString(
    layout.measure,
    chord.event.beatIndex,
    chord.event.voiceIndex,
    head.note.string,
    layout.nextMeasure,
  );
  if (next === undefined || !next.isInOtherMeasure || !next.note.isTied) {
    return [];
  }
  const start = head.x + head.width + TIE.gap;
  const side = tieSide(chord, head, layout.isMultiVoice);
  return layout.width - start < MIN_TIE_LENGTH
    ? []
    : [
        halfArc(
          start,
          layout.width,
          head.y + side * TIE.offset,
          side * TIE.crossHeight,
          TIE.width,
          layout.color,
        ),
      ];
}

export function ties(layout: VoiceLayout): CurveCommand[] {
  return layout.chords.flatMap((chord, index) =>
    chord === undefined
      ? []
      : chord.heads.flatMap(head => [
          ...(head.note.isTied ? incomingTie(layout, chord, index, head) : []),
          ...(layout.nextMeasure === undefined
            ? []
            : outgoingTie(layout, chord, head)),
        ]),
  );
}
