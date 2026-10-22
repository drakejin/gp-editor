// Port of TuxGuitar TGEffectBend / TGEffectTremoloBar units (LGPL-2.1): GP bend and whammy curves for the gtp and gpif readers.

/** GP stores bend and whammy values in 1/100 tones: 25 = a quarter tone. */
const GP_QUARTER_TONE = 25;
/** Highest bend / tremolo bar position (TGEffectBend.MAX_POSITION_LENGTH). */
export const BEND_MAX_POSITION = 12;
/** Highest bend value, in quarter tones (TGEffectBend.MAX_VALUE_LENGTH: three tones). */
export const BEND_MAX_VALUE = 12;
/** Tremolo bar values are clamped to ±24 quarter tones (one octave either way), as TuxGuitar does. */
export const TREMOLO_BAR_LIMIT = 24;

/** Math.round without negative zero (Java's Math.round has none). */
function round(value: number): number {
  return Math.round(value) + 0;
}

/** GP bend value (1/100 tone) to quarter tones. */
export function bendValueFromGp(raw: number): number {
  return round(raw / GP_QUARTER_TONE);
}

/** GP tremolo bar / whammy value (1/100 tone) to quarter tones, clamped to ±24 (TuxGuitar keeps semitones). */
export function tremoloBarValueFromGp(raw: number): number {
  return Math.min(TREMOLO_BAR_LIMIT, Math.max(-TREMOLO_BAR_LIMIT, bendValueFromGp(raw)));
}

/** A curve position on a 0…`sourceMax` scale (GP3–5: 60, GPIF: 100) to the model's 0…12. */
export function bendPositionFromGp(raw: number, sourceMax: number): number {
  return round((raw * BEND_MAX_POSITION) / sourceMax);
}
