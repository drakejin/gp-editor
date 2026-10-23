import { SCALE_ROOTS, type ScaleChoice, scaleNoteNames, scalePitchClasses } from '@gp-editor/core';
import { pitchClassName } from '../lib/pitch';

/** The notes of the scale chosen in the Scales panel, marked on the fretboard and the piano keyboard. */
export interface ScaleHighlight {
  /** Pitch classes, 0 = C … 11 = B, from the root up. */
  readonly pitchClasses: readonly number[];
  readonly root: number;
  /** The notes' names as the scale spells them ("Eb", "Bb"), in the order of `pitchClasses`; sharps when left out. */
  readonly names?: readonly string[];
}

/** Scale marks keep their colours in both appearances, as the piano keys do: green notes, an orange root. */
export const SCALE_COLORS = { note: '#2E8B62', root: '#E07B24', text: '#FFFFFF' } as const;

/** What to mark for a chosen scale; nothing without one. */
export function scaleHighlight(choice: ScaleChoice | undefined): ScaleHighlight | undefined {
  const pitchClasses = choice === undefined ? [] : scalePitchClasses(choice);
  const root = choice === undefined ? undefined : SCALE_ROOTS[choice.rootIndex]?.pitchClass;
  return choice === undefined || pitchClasses.length === 0 || root === undefined ? undefined : { pitchClasses, root, names: scaleNoteNames(choice) };
}

/** A pitch's name on a scale mark: as the scale spells it, else with sharps. */
export function scaleMarkName(pitch: number, highlight: ScaleHighlight | undefined): string {
  const index = highlight?.pitchClasses.indexOf(((pitch % 12) + 12) % 12) ?? -1;
  return highlight?.names?.[index] ?? pitchClassName(pitch);
}

/** The mark colour of a pitch (MIDI, any octave): the root's, another scale note's, or none. */
export function scaleMarkColor(pitch: number, highlight: ScaleHighlight | undefined): string | undefined {
  const pitchClass = ((pitch % 12) + 12) % 12;
  if (highlight === undefined || !highlight.pitchClasses.includes(pitchClass)) {
    return undefined;
  }
  return pitchClass === highlight.root ? SCALE_COLORS.root : SCALE_COLORS.note;
}
