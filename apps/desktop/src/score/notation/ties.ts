import type { Measure } from '@gp-editor/core';
import type { CurveCommand } from '../draw';
import type { Chord, NoteHead } from './chords';
import type { VoiceEvent } from './events';
import { arc } from './glyphs';
import { TIE } from './metrics';

/** Ties grow flatter than this ratio of their length. */
const TIE_CURVATURE = 0.1;
/** Shorter ties than this are not drawn. */
const MIN_TIE_LENGTH = 2;

type Side = 1 | -1;

export interface TieContext {
  readonly events: readonly VoiceEvent[];
  readonly chords: readonly (Chord | undefined)[];
  readonly previousMeasure?: Measure;
  readonly isMultiVoice: boolean;
  readonly color: string;
}

function hasNoteOnString(measure: Measure | undefined, voiceIndex: number, string: number): boolean {
  return measure?.beats.some((beat) => beat.voices[voiceIndex]?.notes.some((note) => note.string === string) ?? false) ?? false;
}

/**
 * Where a tie into `head` starts: after the previous note on the same string in the voice, or — when that note is
 * in the previous measure, whose layout this measure cannot see — a short way left of the note.
 */
function tieStart(context: TieContext, index: number, head: NoteHead): number | undefined {
  const event = context.events[index];
  if (event === undefined) {
    return undefined;
  }
  for (let i = index - 1; i >= 0; i--) {
    const from = context.events[i]?.voiceIndex === event.voiceIndex ? context.chords[i]?.heads.find((h) => h.note.string === head.note.string) : undefined;
    if (from !== undefined) {
      return from.x + from.width + TIE.gap;
    }
  }
  return hasNoteOnString(context.previousMeasure, event.voiceIndex, head.note.string) ? Math.max(TIE.gap, head.x - TIE.entry) : undefined;
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

export function ties(context: TieContext): CurveCommand[] {
  return context.chords.flatMap((chord, index) =>
    (chord?.heads ?? [])
      .filter((head) => head.note.isTied)
      .flatMap((head) => {
        const start = tieStart(context, index, head);
        const end = head.x - TIE.gap;
        if (chord === undefined || start === undefined || end - start < MIN_TIE_LENGTH) {
          return [];
        }
        const side = tieSide(chord, head, context.isMultiVoice);
        const height = Math.min(TIE.maxHeight, TIE.minHeight + (end - start) * TIE_CURVATURE);
        return [arc(start, end, head.y + side * TIE.offset, side * height, TIE.width, context.color)];
      }),
  );
}
