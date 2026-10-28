import { type MeasureLayout, TAB } from '../../lib/layout';
import type { Palette } from '../../theme';
import { voiceTint } from '../voices';

/** Tab staff geometry shared by the tab engraver and its technique symbols, in points. */

/** The paper box behind a fret number, hiding the string line. */
export const FRET_BOX = { width: 22, height: 14 } as const;

/** Effect marks above the tab staff: lanes stack upwards from the marks row (`marksY` is the lowest lane). */
export const TAB_MARKS = {
  fontSize: 9,
  /** Marks start a little left of their beat and read rightwards, like a span label. */
  inset: 8,
  laneHeight: 10,
  /** Music glyphs (accents, waves, "tr") in the marks row. */
  musicSize: 24,
} as const;

/** Bend arrows end this far above the top string. */
export const BEND_TIP = 9;

export function tabStringY(top: number, stringNumber: number): number {
  return top + (stringNumber - 1) * TAB.stringGap;
}

/** Where the time of the beat at `position` (in layout order) ends: before the next beat's fret column, or near the bar line. */
export function beatEndX(layout: MeasureLayout, position: number): number {
  const next = layout.beats[position + 1];
  return next === undefined
    ? layout.width - TAB.padRight / 2
    : next.x - FRET_BOX.width / 2;
}

/**
 * Fret numbers and the techniques on them: the first voice in ink, the others in their voice's colour (Guitar Pro 8's
 * coloured fret numbers for voices 2, 3 and 4); faded while another voice is being edited.
 */
export function voiceColor(voiceIndex: number, palette: Palette, editedVoiceIndex?: number, isTinted = true): string {
  if (editedVoiceIndex !== undefined && editedVoiceIndex !== voiceIndex) {
    return palette.muted;
  }
  // The stylesheet can draw voices 2–4 in ink too ("Colorize fret numbers for voices 2, 3 and 4" off).
  return voiceIndex > 0 && isTinted ? voiceTint(voiceIndex, palette) : palette.text;
}
