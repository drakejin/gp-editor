import type { StringAddress } from '@gp-editor/core';
import type { Palette } from '../theme';

/**
 * How the score tells the four voices apart: stems and rests by voice (standard engraving, as Guitar Pro writes them),
 * and Guitar Pro 8's colours — the voice being edited in full ink, the others faded.
 */

/** Hex alpha of the cursor's wash in voices 2–4 (about 30%). */
const CURSOR_ALPHA = '4D';

/** With more than one voice in a bar, voices 1 and 3 are written stems up, voices 2 and 4 stems down. */
export function isUpperVoice(voiceIndex: number): boolean {
  return voiceIndex % 2 === 0;
}

/** A voice's own colour (the cursor in it, its palette button, its fret numbers in the tab); the accent without voice colours. */
export function voiceTint(voiceIndex: number, palette: Palette): string {
  return palette.voices?.[voiceIndex] ?? palette.accent;
}

/** The cursor's box in the tab: the selection colour in voice 1, a light wash of the voice's colour in the others. */
export function cursorFill(voiceIndex: number, palette: Palette): string {
  return voiceIndex === 0 || palette.voices === undefined ? palette.selection : `${voiceTint(voiceIndex, palette)}${CURSOR_ALPHA}`;
}

/**
 * The voice the rows of track `trackIndex` are edited in, the others faded: the cursor's, on the cursor's track only (the
 * other staves of a multitrack system stay in full ink); none in Multivoice.
 */
export function editedVoiceOf(cursor: StringAddress | undefined, trackIndex: number, isMultivoice: boolean | undefined): number | undefined {
  return isMultivoice === true || cursor === undefined || cursor.trackIndex !== trackIndex ? undefined : cursor.voiceIndex;
}
