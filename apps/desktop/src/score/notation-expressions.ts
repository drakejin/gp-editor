import { EMPTY_NOTE_EFFECT, type Measure, type NoteEffect } from '@gp-editor/core';
import type { MeasureLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { NOTATION } from './notation';
import { engraveTabMarks } from './symbols/tab-marks';

/**
 * Fades and rasgueado over the notation staff when no tab staff shows them: the tab's labels lane, near the top of the
 * notation band, with only those marks (the staff draws the articulations itself).
 */

/** The labels' centre, below the top of the notation band. */
const LABELS_DROP = 8;

function fadesOnly(effect: NoteEffect): NoteEffect {
  return { ...EMPTY_NOTE_EFFECT, fadeIn: effect.fadeIn, ...(effect.fadeOut === true ? { fadeOut: true } : {}), ...(effect.volumeSwell === true ? { volumeSwell: true } : {}) };
}

/** The measure with nothing but its fades and rasgueados. */
function expressionsOf(measure: Measure): Measure {
  return {
    ...measure,
    beats: measure.beats.map((beat) => ({
      ...beat,
      pickStroke: 'none',
      voices: beat.voices.map((voice) => ({ ...voice, notes: voice.notes.map((note) => ({ ...note, effect: fadesOnly(note.effect) })) })),
    })),
  };
}

/** The measure's fades and rasgueados above a notation staff whose top line is at `notationTop` (measure-local). */
export function engraveNotationExpressions(measure: Measure, layout: MeasureLayout, notationTop: number, palette: Palette): DrawCommand[] {
  const marksY = notationTop - NOTATION.above + LABELS_DROP;
  return engraveTabMarks({ measure: expressionsOf(measure), layout, marksY, markLanes: ['labels'], palette });
}
