/**
 * Guitar Pro's short delay for frets of more than one digit ("A short delay allows entering two-digit fret numbers",
 * its user guide on entering notes): a digit typed within it makes one number with the digit just before.
 */
export const DIGIT_WINDOW_MS = 800;

/** Digits make a decimal number. */
const RADIX = 10;

/** A digit key pressed on the score: the digit, when (ms), and which of the score's key presses it was. */
export interface DigitPress {
  readonly digit: number;
  readonly at: number;
  readonly keyIndex: number;
}

/** The fret the digits typed so far at the cursor's note make, and the press of the last one (EditorState.typedFret). */
export interface FretEntry {
  readonly fret: number;
  readonly at: number;
  readonly keyIndex: number;
}

/**
 * The fret a digit makes: with the digits before it when the one before was the key press just before, within the
 * window, and the number stays at most `highest` (MAX_FRET; a drum track's MAX_DRUM_KEY, so 38 or 127 can be typed);
 * else the digit alone. The editor drops the entry on anything else that happens (state/fret-entry.ts), so a digit
 * never combines with one typed at another note.
 */
export function nextFretEntry(previous: FretEntry | undefined, press: DigitPress, highest: number): FretEntry {
  const isNext = previous !== undefined && press.keyIndex === previous.keyIndex + 1 && press.at - previous.at <= DIGIT_WINDOW_MS;
  const combined = isNext ? previous.fret * RADIX + press.digit : undefined;
  const fret = combined !== undefined && combined <= highest ? combined : press.digit;
  return { fret, at: press.at, keyIndex: press.keyIndex };
}
