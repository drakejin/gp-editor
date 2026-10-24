import { SMUFL, type TextCommand } from '../draw';
import { dotCount } from './chords';
import type { VoiceEvent } from './events';
import { musicGlyph } from './glyphs';
import { DOT, GLYPH_WIDTH, STAFF, positionY } from './metrics';
import { isUpperVoice } from '../voices';

const REST_GLYPHS: ReadonlyMap<number, string> = new Map([
  [1, SMUFL.restWhole],
  [2, SMUFL.restHalf],
  [4, SMUFL.restQuarter],
  [8, SMUFL.rest8th],
  [16, SMUFL.rest16th],
  [32, SMUFL.rest32nd],
  [64, SMUFL.rest64th],
]);
/** The whole rest hangs from the fourth line; the other rests are centred on the middle line. */
const WHOLE_REST_POSITION = STAFF.middleLine + 2;
/** With more than one voice, the rests of voices 1 and 3 move up two spaces and those of voices 2 and 4 down two spaces. */
const VOICE_SHIFT = 4;

export function restPosition(event: VoiceEvent, isMultiVoice: boolean): number {
  if (event.restPosition !== undefined) {
    return event.restPosition;
  }
  const shift = !isMultiVoice
    ? 0
    : isUpperVoice(event.voiceIndex)
    ? VOICE_SHIFT
    : -VOICE_SHIFT;
  return (
    (event.duration.value === 1 ? WHOLE_REST_POSITION : STAFF.middleLine) +
    shift
  );
}

export function rest(
  event: VoiceEvent,
  isMultiVoice: boolean,
  top: number,
  color: string,
): TextCommand[] {
  const position = restPosition(event, isMultiVoice);
  const glyph = REST_GLYPHS.get(event.duration.value) ?? SMUFL.restQuarter;
  const dotX = event.x + GLYPH_WIDTH.rest / 2 + DOT.gap;
  const dotY = positionY(top, position + (position % 2 === 0 ? 1 : 0));
  return [
    musicGlyph(event.x, positionY(top, position), glyph, color, 'center'),
    ...Array.from({ length: dotCount(event.duration) }, (_, k) =>
      musicGlyph(dotX + k * DOT.spacing, dotY, SMUFL.augmentationDot, color),
    ),
  ];
}

/** Hex alpha of the rest standing for an empty voice being edited (about 40%). */
const EMPTY_VOICE_ALPHA = '66';

/**
 * A bar whose voice being edited has nothing in it: that voice's whole rest, faint, at its side of the staff (centred at
 * `x`, in `tint`, the voice's colour) — where typing a fret starts the voice.
 */
export function emptyVoiceRest(
  x: number,
  top: number,
  voiceIndex: number,
  tint: string,
): TextCommand {
  const position =
    WHOLE_REST_POSITION + (isUpperVoice(voiceIndex) ? VOICE_SHIFT : -VOICE_SHIFT);
  return musicGlyph(
    x,
    positionY(top, position),
    SMUFL.restWhole,
    `${tint}${EMPTY_VOICE_ALPHA}`,
    'center',
  );
}

/** The whole rest of a measure without beats, centred at `x`. */
export function measureRest(
  x: number,
  top: number,
  color: string,
): TextCommand {
  return musicGlyph(
    x,
    positionY(top, WHOLE_REST_POSITION),
    SMUFL.restWhole,
    color,
    'center',
  );
}
